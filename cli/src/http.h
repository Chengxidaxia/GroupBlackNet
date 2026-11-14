// http.h — 基于 WinHTTP 的最小 HTTPS 客户端（无第三方依赖）
#pragma once
#include <string>
#include <utility>
#include <vector>

namespace bn {

struct HttpResponse {
  int status = 0;
  std::string body;
  std::string error;   // 非空表示传输层失败
  bool ok() const { return error.empty() && status >= 200 && status < 300; }
};

using Headers = std::vector<std::pair<std::string, std::string>>;

class Http {
 public:
  HttpResponse get(const std::string& url, const Headers& headers = {}, int timeoutMs = 30000);
  HttpResponse post(const std::string& url, const std::string& body, const std::string& contentType,
                    const Headers& headers = {}, int timeoutMs = 60000);
  HttpResponse put(const std::string& url, const std::string& body, const std::string& contentType,
                   const Headers& headers = {}, int timeoutMs = 60000);
  HttpResponse del(const std::string& url, const Headers& headers = {}, int timeoutMs = 30000);
  HttpResponse send(const std::string& method, const std::string& url, const std::string& body,
                    const std::string& contentType, const Headers& headers, int timeoutMs,
                    bool followRedirects);

  bool verbose = false;
};

/* 便捷：解析 URL 的 scheme/host/port/path（仅供内部使用） */
struct UrlParts {
  bool https = true;
  std::wstring host;
  unsigned short port = 443;
  std::wstring path;  // 含 query
  bool valid = false;
};
UrlParts parseUrl(const std::string& url);

}  // namespace bn
