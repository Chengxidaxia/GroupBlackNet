// util.h — 基础工具：编码、终端、文件、时间
#pragma once
#include <string>
#include <vector>
#include <cstdint>
#include <cstddef>

namespace bn {

/* ---------------- base64 ---------------- */
std::string b64encode(const std::vector<uint8_t>& in);
std::string b64encode(const std::string& in);
std::vector<uint8_t> b64decode(const std::string& in);

/* ---------------- 编码 / 字符 ---------------- */
std::string toHex(const std::vector<uint8_t>& in);
std::string utf8ToWideLossless(const std::wstring& w);          // wide → utf8
std::wstring utf8ToWide(const std::string& s);                  // utf8 → wide
std::string lowerAscii(std::string s);
bool icontains(const std::string& hay, const std::string& needle);
size_t displayWidth(const std::string& utf8);                   // CJK 记 2 列
std::string padRight(const std::string& s, size_t width);
std::string padLeft(const std::string& s, size_t width);
std::string truncDisplay(const std::string& s, size_t width);

/* ---------------- 字符串 ---------------- */
std::string trim(const std::string& s);
std::vector<std::string> splitAny(const std::string& s, const std::string& seps);
bool startsWith(const std::string& s, const std::string& p);
bool endsWith(const std::string& s, const std::string& p);
std::string replaceAll(std::string s, const std::string& from, const std::string& to);

/* ---------------- 时间 ---------------- */
std::string nowIso();                    // 2026-11-14T13:00:00.000Z
std::string nowLocalHuman();             // 2026-11-14 13:00:00
std::string isoToLocal(const std::string& iso);
std::string humanBytes(size_t n);

/* ---------------- 文件 ---------------- */
bool fileExists(const std::string& path);
std::string readFile(const std::string& path);          // 失败返回空串
bool writeFile(const std::string& path, const std::string& data);
bool writeFileBinary(const std::string& path, const std::vector<uint8_t>& data);
std::string homeDir();                                  // %USERPROFILE%
std::string exeDir();
bool makeDirs(const std::string& path);

/* ---------------- gzip（zlib） ---------------- */
std::vector<uint8_t> gzipCompress(const std::vector<uint8_t>& in);
std::vector<uint8_t> gzipDecompress(const std::vector<uint8_t>& in);

/* ---------------- Unicode 宽度表用的分类 ---------------- */
bool isWideChar(uint32_t cp);

}  // namespace bn
