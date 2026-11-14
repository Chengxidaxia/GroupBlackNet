#include "http.h"

#include <windows.h>
#include <winhttp.h>

#include <cstdio>

#include "util.h"

namespace bn {

static std::string lastErr(const char* what) {
  DWORD e = GetLastError();
  char buf[256];
  snprintf(buf, sizeof(buf), "%s 失败（Win32 错误 %lu）", what, (unsigned long)e);
  return buf;
}

UrlParts parseUrl(const std::string& url) {
  UrlParts p;
  std::wstring w = utf8ToWide(url);
  URL_COMPONENTS uc{};
  uc.dwStructSize = sizeof(uc);
  wchar_t host[256] = {0}, path[4096] = {0}, scheme[16] = {0};
  uc.lpszHostName = host; uc.dwHostNameLength = 255;
  uc.lpszUrlPath = path; uc.dwUrlPathLength = 4095;
  uc.lpszScheme = scheme; uc.dwSchemeLength = 15;
  if (!WinHttpCrackUrl(w.c_str(), (DWORD)w.size(), 0, &uc)) return p;
  p.valid = true;
  p.https = uc.nScheme == INTERNET_SCHEME_HTTPS;
  p.host = host;
  p.port = uc.nPort;
  p.path = path;
  if (uc.dwExtraInfoLength) p.path += std::wstring(uc.lpszExtraInfo, uc.dwExtraInfoLength);
  return p;
}

HttpResponse Http::send(const std::string& method, const std::string& url, const std::string& body,
                        const std::string& contentType, const Headers& headers, int timeoutMs,
                        bool followRedirects) {
  HttpResponse out;
  UrlParts u = parseUrl(url);
  if (!u.valid) {
    out.error = "URL 解析失败：" + url;
    return out;
  }
  bool reparse = false;
  do {
    reparse = false;
    HINTERNET hSession = WinHttpOpen(L"BlackNet-CLI/0.1",
                                     WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_NO_PROXY_NAME,
                                     WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) {
      // 老系统不支持 AUTOMATIC_PROXY，退回默认代理
      hSession = WinHttpOpen(L"BlackNet-CLI/0.1", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                             WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    }
    if (!hSession) {
      out.error = lastErr("建立会话");
      return out;
    }
    WinHttpSetTimeouts(hSession, timeoutMs, timeoutMs, timeoutMs, timeoutMs);

    HINTERNET hConn = WinHttpConnect(hSession, u.host.c_str(), u.port, 0);
    if (!hConn) {
      out.error = lastErr("连接主机");
      WinHttpCloseHandle(hSession);
      return out;
    }

    std::wstring wmethod = utf8ToWide(method);
    DWORD flags = u.https ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET hReq = WinHttpOpenRequest(hConn, wmethod.c_str(), u.path.c_str(), nullptr,
                                        WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hReq) {
      out.error = lastErr("创建请求");
      WinHttpCloseHandle(hConn);
      WinHttpCloseHandle(hSession);
      return out;
    }

    DWORD redirectPolicy = followRedirects ? WINHTTP_OPTION_REDIRECT_POLICY_ALWAYS
                                           : WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
    WinHttpSetOption(hReq, WINHTTP_OPTION_REDIRECT_POLICY, &redirectPolicy, sizeof(redirectPolicy));

    std::wstring allHeaders;
    for (auto& h : headers) allHeaders += utf8ToWide(h.first + ": " + h.second) + L"\r\n";
    if (!contentType.empty() && body.size())
      allHeaders += utf8ToWide("Content-Type: " + contentType) + L"\r\n";

    BOOL sent = WinHttpSendRequest(
        hReq, allHeaders.empty() ? WINHTTP_NO_ADDITIONAL_HEADERS : allHeaders.c_str(),
        allHeaders.empty() ? 0 : (DWORD)-1L,
        body.empty() ? WINHTTP_NO_REQUEST_DATA : (LPVOID)body.data(), (DWORD)body.size(),
        (DWORD)body.size(), 0);
    if (!sent) {
      out.error = lastErr("发送请求");
      WinHttpCloseHandle(hReq);
      WinHttpCloseHandle(hConn);
      WinHttpCloseHandle(hSession);
      return out;
    }
    if (!WinHttpReceiveResponse(hReq, nullptr)) {
      out.error = lastErr("接收响应");
      WinHttpCloseHandle(hReq);
      WinHttpCloseHandle(hConn);
      WinHttpCloseHandle(hSession);
      return out;
    }

    DWORD status = 0, len = sizeof(status);
    WinHttpQueryHeaders(hReq, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        WINHTTP_HEADER_NAME_BY_INDEX, &status, &len, WINHTTP_NO_HEADER_INDEX);
    out.status = (int)status;

    // 重定向：WinHTTP 的 ALWAYS 会自动跟，但需要再查一次 Location
    if (status >= 300 && status < 400 && followRedirects) {
      wchar_t loc[4096] = {0};
      DWORD lsz = sizeof(loc);
      if (WinHttpQueryHeaders(hReq, WINHTTP_QUERY_LOCATION, WINHTTP_HEADER_NAME_BY_INDEX, loc, &lsz,
                              WINHTTP_NO_HEADER_INDEX)) {
        std::string next = utf8ToWideLossless(loc);
        WinHttpCloseHandle(hReq);
        WinHttpCloseHandle(hConn);
        WinHttpCloseHandle(hSession);
        if (!next.empty()) {
          if (next[0] == '/') {
            next = (u.https ? "https://" : "http://") + utf8ToWideLossless(u.host) +
                   (u.port == (u.https ? 443 : 80) ? "" : ":" + std::to_string(u.port)) + next;
          }
          u = parseUrl(next);
          if (!u.valid) {
            out.error = "重定向地址解析失败：" + next;
            return out;
          }
          reparse = true;
          continue;
        }
      }
    }

    std::string data;
    DWORD avail = 0;
    do {
      avail = 0;
      if (!WinHttpQueryDataAvailable(hReq, &avail)) {
        out.error = lastErr("读取数据");
        break;
      }
      if (!avail) break;
      std::string chunk(avail, '\0');
      DWORD read = 0;
      if (!WinHttpReadData(hReq, &chunk[0], avail, &read)) {
        out.error = lastErr("读取数据");
        break;
      }
      data.append(chunk.data(), read);
    } while (avail > 0);

    out.body = std::move(data);
    WinHttpCloseHandle(hReq);
    WinHttpCloseHandle(hConn);
    WinHttpCloseHandle(hSession);
  } while (reparse);

  return out;
}

HttpResponse Http::get(const std::string& url, const Headers& headers, int timeoutMs) {
  return send("GET", url, "", "", headers, timeoutMs, true);
}

HttpResponse Http::post(const std::string& url, const std::string& body, const std::string& contentType,
                        const Headers& headers, int timeoutMs) {
  return send("POST", url, body, contentType, headers, timeoutMs, true);
}

HttpResponse Http::put(const std::string& url, const std::string& body, const std::string& contentType,
                       const Headers& headers, int timeoutMs) {
  return send("PUT", url, body, contentType, headers, timeoutMs, true);
}

HttpResponse Http::del(const std::string& url, const Headers& headers, int timeoutMs) {
  return send("DELETE", url, "", "", headers, timeoutMs, true);
}

}  // namespace bn
