#include "util.h"

#include <windows.h>
#include <zlib.h>

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <fstream>
#include <sstream>

namespace bn {

/* ================= base64 ================= */
static const char* B64C = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

std::string b64encode(const std::vector<uint8_t>& in) {
  std::string out;
  out.reserve((in.size() + 2) / 3 * 4);
  size_t i = 0;
  while (i + 2 < in.size()) {
    uint32_t n = (in[i] << 16) | (in[i + 1] << 8) | in[i + 2];
    out += B64C[(n >> 18) & 63];
    out += B64C[(n >> 12) & 63];
    out += B64C[(n >> 6) & 63];
    out += B64C[n & 63];
    i += 3;
  }
  if (i + 1 == in.size()) {
    uint32_t n = in[i] << 16;
    out += B64C[(n >> 18) & 63];
    out += B64C[(n >> 12) & 63];
    out += "==";
  } else if (i + 2 == in.size()) {
    uint32_t n = (in[i] << 16) | (in[i + 1] << 8);
    out += B64C[(n >> 18) & 63];
    out += B64C[(n >> 12) & 63];
    out += B64C[(n >> 6) & 63];
    out += '=';
  }
  return out;
}

std::string b64encode(const std::string& in) {
  return b64encode(std::vector<uint8_t>(in.begin(), in.end()));
}

std::vector<uint8_t> b64decode(const std::string& in) {
  static int8_t tbl[256];
  static bool init = false;
  if (!init) {
    memset(tbl, -1, sizeof(tbl));
    for (int i = 0; i < 64; i++) tbl[(uint8_t)B64C[i]] = (int8_t)i;
    tbl[(uint8_t)'-'] = 62;  // base64url 兼容
    tbl[(uint8_t)'_'] = 63;
    init = true;
  }
  std::vector<uint8_t> out;
  out.reserve(in.size() * 3 / 4);
  uint32_t buf = 0;
  int bits = 0;
  for (unsigned char c : in) {
    int8_t v = tbl[c];
    if (v < 0) continue;  // 跳过 '=' 与空白
    buf = (buf << 6) | (uint32_t)v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push_back((uint8_t)((buf >> bits) & 0xFF));
    }
  }
  return out;
}

std::string toHex(const std::vector<uint8_t>& in) {
  static const char* H = "0123456789abcdef";
  std::string s;
  s.reserve(in.size() * 2);
  for (uint8_t b : in) {
    s += H[b >> 4];
    s += H[b & 15];
  }
  return s;
}

/* ================= 宽窄字符串 ================= */
std::string utf8ToWideLossless(const std::wstring& w) {
  if (w.empty()) return "";
  int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), nullptr, 0, nullptr, nullptr);
  std::string s((size_t)n, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), &s[0], n, nullptr, nullptr);
  return s;
}

std::wstring utf8ToWide(const std::string& s) {
  if (s.empty()) return L"";
  int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
  std::wstring w((size_t)n, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &w[0], n);
  return w;
}

/* ================= 文本 ================= */
std::string lowerAscii(std::string s) {
  for (auto& c : s)
    if (c >= 'A' && c <= 'Z') c = (char)(c - 'A' + 'a');
  return s;
}

bool icontains(const std::string& hay, const std::string& needle) {
  if (needle.empty()) return true;
  return lowerAscii(hay).find(lowerAscii(needle)) != std::string::npos;
}

bool isWideChar(uint32_t cp) {
  return (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0xA4CF) ||
         (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF) ||
         (cp >= 0xFE30 && cp <= 0xFE6F) || (cp >= 0xFF00 && cp <= 0xFF60) ||
         (cp >= 0xFFE0 && cp <= 0xFFE6) || (cp >= 0x1F300 && cp <= 0x1F64F) ||
         (cp >= 0x1F900 && cp <= 0x1F9FF) || (cp >= 0x20000 && cp <= 0x3FFFD);
}

size_t displayWidth(const std::string& s) {
  size_t w = 0;
  size_t i = 0;
  while (i < s.size()) {
    unsigned char c = (unsigned char)s[i];
    uint32_t cp = c;
    size_t len = 1;
    if ((c & 0x80) == 0) {
      cp = c;
    } else if ((c & 0xE0) == 0xC0 && i + 1 < s.size()) {
      cp = ((c & 0x1F) << 6) | ((unsigned char)s[i + 1] & 0x3F);
      len = 2;
    } else if ((c & 0xF0) == 0xE0 && i + 2 < s.size()) {
      cp = ((c & 0x0F) << 12) | (((unsigned char)s[i + 1] & 0x3F) << 6) | ((unsigned char)s[i + 2] & 0x3F);
      len = 3;
    } else if ((c & 0xF8) == 0xF0 && i + 3 < s.size()) {
      cp = ((c & 0x07) << 18) | (((unsigned char)s[i + 1] & 0x3F) << 12) |
           (((unsigned char)s[i + 2] & 0x3F) << 6) | ((unsigned char)s[i + 3] & 0x3F);
      len = 4;
    }
    w += isWideChar(cp) ? 2 : 1;
    i += len;
  }
  return w;
}

std::string padRight(const std::string& s, size_t width) {
  size_t w = displayWidth(s);
  return w >= width ? s : s + std::string(width - w, ' ');
}

std::string padLeft(const std::string& s, size_t width) {
  size_t w = displayWidth(s);
  return w >= width ? s : std::string(width - w, ' ') + s;
}

std::string truncDisplay(const std::string& s, size_t width) {
  if (displayWidth(s) <= width) return s;
  std::string out;
  size_t w = 0, i = 0;
  while (i < s.size()) {
    unsigned char c = (unsigned char)s[i];
    size_t len = 1;
    if ((c & 0x80) == 0) len = 1;
    else if ((c & 0xE0) == 0xC0) len = 2;
    else if ((c & 0xF0) == 0xE0) len = 3;
    else len = 4;
    std::string ch = s.substr(i, len);
    size_t cw = displayWidth(ch);
    if (w + cw + 1 > width) break;
    out += ch;
    w += cw;
    i += len;
  }
  return out + "…";
}

std::string trim(const std::string& s) {
  size_t a = 0, b = s.size();
  while (a < b && (unsigned char)s[a] <= 0x20) a++;
  while (b > a && (unsigned char)s[b - 1] <= 0x20) b--;
  return s.substr(a, b - a);
}

// 按「一组分隔符字符」切分。分隔符可能是中文（，、），必须按 UTF-8
// 码点比较，逐字节比较会把多字节字符从中间切断（0x80/0x81 是常见尾字节）。
std::vector<std::string> splitAny(const std::string& s, const std::string& seps) {
  auto decode = [](const std::string& str, size_t& i) -> uint32_t {
    unsigned char c = (unsigned char)str[i];
    if ((c & 0x80) == 0) { i += 1; return c; }
    if ((c & 0xE0) == 0xC0 && i + 1 < str.size()) {
      uint32_t cp = ((c & 0x1F) << 6) | ((unsigned char)str[i + 1] & 0x3F);
      i += 2;
      return cp;
    }
    if ((c & 0xF0) == 0xE0 && i + 2 < str.size()) {
      uint32_t cp = ((c & 0x0F) << 12) | (((unsigned char)str[i + 1] & 0x3F) << 6) |
                    ((unsigned char)str[i + 2] & 0x3F);
      i += 3;
      return cp;
    }
    if ((c & 0xF8) == 0xF0 && i + 3 < str.size()) {
      uint32_t cp = ((c & 0x07) << 18) | (((unsigned char)str[i + 1] & 0x3F) << 12) |
                    (((unsigned char)str[i + 2] & 0x3F) << 6) | ((unsigned char)str[i + 3] & 0x3F);
      i += 4;
      return cp;
    }
    i += 1;
    return c;
  };

  std::vector<uint32_t> sepCps;
  for (size_t i = 0; i < seps.size();) sepCps.push_back(decode(seps, i));

  std::vector<std::string> out;
  std::string cur;
  for (size_t i = 0; i < s.size();) {
    size_t start = i;
    uint32_t cp = decode(s, i);
    bool isSep = false;
    for (uint32_t sc : sepCps)
      if (sc == cp) { isSep = true; break; }
    if (isSep) {
      std::string t = trim(cur);
      if (!t.empty()) out.push_back(t);
      cur.clear();
    } else {
      cur.append(s, start, i - start);
    }
  }
  std::string t = trim(cur);
  if (!t.empty()) out.push_back(t);
  return out;
}

bool startsWith(const std::string& s, const std::string& p) {
  return s.size() >= p.size() && s.compare(0, p.size(), p) == 0;
}

bool endsWith(const std::string& s, const std::string& p) {
  return s.size() >= p.size() && s.compare(s.size() - p.size(), p.size(), p) == 0;
}

std::string replaceAll(std::string s, const std::string& from, const std::string& to) {
  if (from.empty()) return s;
  size_t pos = 0;
  while ((pos = s.find(from, pos)) != std::string::npos) {
    s.replace(pos, from.size(), to);
    pos += to.size();
  }
  return s;
}

/* ================= 时间 ================= */
std::string nowIso() {
  SYSTEMTIME st;
  GetSystemTime(&st);
  char buf[40];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ", st.wYear, st.wMonth, st.wDay,
           st.wHour, st.wMinute, st.wSecond, st.wMilliseconds);
  return buf;
}

std::string nowLocalHuman() {
  SYSTEMTIME st;
  GetLocalTime(&st);
  char buf[40];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02d %02d:%02d:%02d", st.wYear, st.wMonth, st.wDay, st.wHour,
           st.wMinute, st.wSecond);
  return buf;
}

std::string isoToLocal(const std::string& iso) {
  if (iso.size() < 19) return iso;
  int Y = 0, M = 0, D = 0, h = 0, m = 0, s = 0;
  if (sscanf(iso.c_str(), "%d-%d-%dT%d:%d:%d", &Y, &M, &D, &h, &m, &s) != 6) return iso;
  // 简易 UTC → 本地时区偏移
  SYSTEMTIME utc{};
  utc.wYear = (WORD)Y; utc.wMonth = (WORD)M; utc.wDay = (WORD)D;
  utc.wHour = (WORD)h; utc.wMinute = (WORD)m; utc.wSecond = (WORD)s;
  FILETIME ft;
  if (!SystemTimeToFileTime(&utc, &ft)) return iso;
  FILETIME lft;
  if (!FileTimeToLocalFileTime(&ft, &lft)) return iso;
  SYSTEMTIME lt;
  if (!FileTimeToSystemTime(&lft, &lt)) return iso;
  char buf[40];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02d %02d:%02d", lt.wYear, lt.wMonth, lt.wDay, lt.wHour,
           lt.wMinute);
  return buf;
}

std::string humanBytes(size_t n) {
  char buf[32];
  if (n < 1024) snprintf(buf, sizeof(buf), "%zu B", n);
  else if (n < 1024 * 1024) snprintf(buf, sizeof(buf), "%.1f KB", n / 1024.0);
  else snprintf(buf, sizeof(buf), "%.2f MB", n / 1048576.0);
  return buf;
}

/* ================= 文件 ================= */
bool fileExists(const std::string& path) {
  DWORD a = GetFileAttributesW(utf8ToWide(path).c_str());
  return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

std::string readFile(const std::string& path) {
  std::wstring w = utf8ToWide(path);
  FILE* f = _wfopen(w.c_str(), L"rb");
  if (!f) return "";
  std::string out;
  char buf[65536];
  size_t n;
  while ((n = fread(buf, 1, sizeof(buf), f)) > 0) out.append(buf, n);
  fclose(f);
  return out;
}

bool writeFileBinary(const std::string& path, const std::vector<uint8_t>& data) {
  std::wstring w = utf8ToWide(path);
  FILE* f = _wfopen(w.c_str(), L"wb");
  if (!f) return false;
  bool ok = data.empty() || fwrite(data.data(), 1, data.size(), f) == data.size();
  fclose(f);
  return ok;
}

bool writeFile(const std::string& path, const std::string& data) {
  return writeFileBinary(path, std::vector<uint8_t>(data.begin(), data.end()));
}

std::string homeDir() {
  wchar_t buf[MAX_PATH];
  DWORD n = GetEnvironmentVariableW(L"USERPROFILE", buf, MAX_PATH);
  if (!n) return ".";
  return utf8ToWideLossless(std::wstring(buf, n));
}

std::string exeDir() {
  wchar_t buf[MAX_PATH];
  DWORD n = GetModuleFileNameW(nullptr, buf, MAX_PATH);
  std::wstring p(buf, n);
  size_t pos = p.find_last_of(L"\\/");
  return utf8ToWideLossless(pos == std::wstring::npos ? p : p.substr(0, pos));
}

bool makeDirs(const std::string& path) { return CreateDirectoryW(utf8ToWide(path).c_str(), nullptr) != 0 || GetLastError() == ERROR_ALREADY_EXISTS; }

/* ================= gzip ================= */
std::vector<uint8_t> gzipCompress(const std::vector<uint8_t>& in) {
  z_stream zs{};
  if (deflateInit2(&zs, Z_DEFAULT_COMPRESSION, Z_DEFLATED, 15 + 16, 8, Z_DEFAULT_STRATEGY) != Z_OK)
    return {};
  std::vector<uint8_t> out(deflateBound(&zs, (uLong)in.size()) + 32);
  zs.next_in = const_cast<Bytef*>(in.data());
  zs.avail_in = (uInt)in.size();
  zs.next_out = out.data();
  zs.avail_out = (uInt)out.size();
  int rc = deflate(&zs, Z_FINISH);
  size_t produced = out.size() - zs.avail_out;
  deflateEnd(&zs);
  if (rc != Z_STREAM_END) return {};
  out.resize(produced);
  return out;
}

std::vector<uint8_t> gzipDecompress(const std::vector<uint8_t>& in) {
  z_stream zs{};
  if (inflateInit2(&zs, 15 + 32) != Z_OK) return {};
  zs.next_in = const_cast<Bytef*>(in.data());
  zs.avail_in = (uInt)in.size();
  std::vector<uint8_t> out;
  std::vector<uint8_t> buf(65536);
  int rc = Z_OK;
  while (rc == Z_OK) {
    zs.next_out = buf.data();
    zs.avail_out = (uInt)buf.size();
    rc = inflate(&zs, Z_NO_FLUSH);
    if (rc != Z_OK && rc != Z_STREAM_END) break;
    out.insert(out.end(), buf.data(), buf.data() + (buf.size() - zs.avail_out));
  }
  inflateEnd(&zs);
  if (rc != Z_STREAM_END) return {};
  return out;
}

}  // namespace bn
