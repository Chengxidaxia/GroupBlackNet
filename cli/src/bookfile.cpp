#include "bookfile.h"

#include <algorithm>
#include <cstdio>
#include <set>

#include "crypto.h"
#include "util.h"

namespace bn {

std::string siteKey() { return "bbn-site-4f2c9a71d8e35b60a4c7e29f1d6b83ac"; }

/* ---------------- 基础 ---------------- */

static std::vector<uint32_t> utf8Codepoints(const std::string& s) {
  std::vector<uint32_t> out;
  size_t i = 0;
  while (i < s.size()) {
    unsigned char c = (unsigned char)s[i];
    uint32_t cp = c;
    size_t len = 1;
    if ((c & 0x80) == 0) { cp = c; len = 1; }
    else if ((c & 0xE0) == 0xC0 && i + 1 < s.size()) {
      cp = ((c & 0x1F) << 6) | ((unsigned char)s[i + 1] & 0x3F); len = 2;
    } else if ((c & 0xF0) == 0xE0 && i + 2 < s.size()) {
      cp = ((c & 0x0F) << 12) | (((unsigned char)s[i + 1] & 0x3F) << 6) |
           ((unsigned char)s[i + 2] & 0x3F); len = 3;
    } else if ((c & 0xF8) == 0xF0 && i + 3 < s.size()) {
      cp = ((c & 0x07) << 18) | (((unsigned char)s[i + 1] & 0x3F) << 12) |
           (((unsigned char)s[i + 2] & 0x3F) << 6) | ((unsigned char)s[i + 3] & 0x3F); len = 4;
    }
    out.push_back(cp);
    i += len;
  }
  return out;
}

static void appendUtf8(std::string& s, uint32_t cp) {
  if (cp < 0x80) s += (char)cp;
  else if (cp < 0x800) {
    s += (char)(0xC0 | (cp >> 6));
    s += (char)(0x80 | (cp & 0x3F));
  } else if (cp < 0x10000) {
    s += (char)(0xE0 | (cp >> 12));
    s += (char)(0x80 | ((cp >> 6) & 0x3F));
    s += (char)(0x80 | (cp & 0x3F));
  } else {
    s += (char)(0xF0 | (cp >> 18));
    s += (char)(0x80 | ((cp >> 12) & 0x3F));
    s += (char)(0x80 | ((cp >> 6) & 0x3F));
    s += (char)(0x80 | (cp & 0x3F));
  }
}

static bool isCjk(uint32_t cp) {
  return (cp >= 0x4E00 && cp <= 0x9FA5) || (cp >= 0x3040 && cp <= 0x30FF);
}

size_t countWords(const std::string& md) {
  if (md.empty()) return 0;
  // 去掉围栏代码块
  std::string t;
  size_t pos = 0;
  while (pos < md.size()) {
    size_t a = md.find("```", pos);
    if (a == std::string::npos) { t += md.substr(pos); break; }
    t += md.substr(pos, a - pos);
    size_t b = md.find("```", a + 3);
    if (b == std::string::npos) break;
    t += ' ';
    pos = b + 3;
  }
  // 图片整体去掉、链接保留文字
  std::string t2;
  for (size_t i = 0; i < t.size();) {
    if (t.compare(i, 2, "![") == 0) {
      size_t close = t.find(']', i);
      size_t par = close == std::string::npos ? std::string::npos : t.find(')', close);
      if (close != std::string::npos && par != std::string::npos) {
        t2 += ' ';
        i = par + 1;
        continue;
      }
    }
    if (t[i] == '[') {
      size_t close = t.find(']', i);
      if (close != std::string::npos && close + 1 < t.size() && t[close + 1] == '(') {
        size_t par = t.find(')', close);
        if (par != std::string::npos) {
          t2 += t.substr(i + 1, close - i - 1);
          i = par + 1;
          continue;
        }
      }
    }
    t2 += t[i];
    i++;
  }

  size_t cn = 0, en = 0;
  bool inWord = false;
  for (uint32_t cp : utf8Codepoints(t2)) {
    if (isCjk(cp)) { cn++; inWord = false; continue; }
    bool alnum = (cp >= 'A' && cp <= 'Z') || (cp >= 'a' && cp <= 'z') || (cp >= '0' && cp <= '9');
    if (alnum) {
      if (!inWord) { en++; inWord = true; }
    } else {
      inWord = false;
    }
  }
  return cn + en;
}

std::vector<std::string> cleanCats(const nlohmann::json& src) {
  std::vector<nlohmann::json> raw;
  if (src.is_array()) raw = src.get<std::vector<nlohmann::json>>();
  else if (src.is_object()) {
    if (src.contains("categories") && src["categories"].is_array())
      raw = src["categories"].get<std::vector<nlohmann::json>>();
    else if (src.contains("category") && src["category"].is_string())
      raw = {src["category"]};
  }
  std::vector<std::string> out;
  for (auto& v : raw) {
    if (!v.is_string()) continue;
    std::string s = trim(v.get<std::string>());
    if (s.size() > 20) s = truncDisplay(s, 20);
    if (s.empty()) continue;
    if (std::find(out.begin(), out.end(), s) == out.end()) out.push_back(s);
    if (out.size() >= 8) break;
  }
  return out;
}

std::string newBookId() {
  auto r = randomBytes(5);
  char buf[32];
  snprintf(buf, sizeof(buf), "bk_%08x%02x", (unsigned)(unsigned long)time(nullptr), r.empty() ? 0 : r[0]);
  return buf;
}

/* ---------------- 封面 ---------------- */
static const char* kPalette[10][2] = {
    {"#7c3a2e", "#3d1c16"}, {"#2f4f4a", "#152a26"}, {"#37506e", "#1a283a"},
    {"#6b5340", "#31241a"}, {"#5a3a55", "#291827"}, {"#7a5c2e", "#382810"},
    {"#8a4a28", "#3a1d0e"}, {"#3f4a58", "#1c2229"}, {"#6a3838", "#301717"},
    {"#2e4a3c", "#14251c"}};

static std::string firstChar(const std::string& title) {
  auto cps = utf8Codepoints(title.empty() ? "书" : title);
  size_t i = 0;
  auto isSpace = [](uint32_t c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n'; };
  auto isStrip = [](uint32_t c) {
    return c == 0x300A || c == 0x300C || c == 0x3010 || c == '(' || c == 0xFF08;  // 《「【(（
  };
  while (i < cps.size() && (isSpace(cps[i]) || isStrip(cps[i]))) i++;
  if (i >= cps.size()) return "书";
  std::string s;
  appendUtf8(s, cps[i]);
  return s;
}

static nlohmann::json coverOf(const nlohmann::json& meta) {
  if (meta.contains("cover") && meta["cover"].is_object()) {
    auto& c = meta["cover"];
    if (c.value("type", "") == "image" && !c.value("url", "").empty()) return c;
  }
  std::string seed = meta.value("title", "");
  if (seed.empty()) seed = meta.value("id", "");
  uint32_t h = 0;
  for (uint32_t cp : utf8Codepoints(seed)) h = (h * 31 + cp) & 0xFFFFFFFFu;
  auto& p = kPalette[h % 10];
  return nlohmann::json{{"type", "letter"}, {"from", p[0]}, {"to", p[1]},
                        {"text", firstChar(meta.value("title", "书"))}};
}

nlohmann::json normalizeBookMeta(const nlohmann::json& m, const std::string& fallbackId) {
  nlohmann::json src = m.is_object() ? m : nlohmann::json::object();
  auto cats = cleanCats(src);
  if (cats.empty()) cats.push_back("其他");

  std::string id = src.value("id", fallbackId);
  std::string idClean;
  for (char c : id)
    if (isalnum((unsigned char)c) || c == '_' || c == '-') idClean += c;
  if (idClean.size() > 60) idClean = idClean.substr(0, 60);
  if (idClean.empty()) idClean = fallbackId;

  std::vector<std::string> tags;
  if (src.contains("tags") && src["tags"].is_array())
    for (auto& t : src["tags"])
      if (t.is_string() && tags.size() < 12 && !t.get<std::string>().empty())
        tags.push_back(t.get<std::string>());

  std::string title = trim(src.value("title", "未命名作品"));
  if (title.size() > 60) title = title.substr(0, 60);
  std::string author = trim(src.value("author", "佚名"));
  if (author.size() > 30) author = author.substr(0, 30);
  std::string intro = trim(src.value("intro", ""));
  if (intro.size() > 500) intro = intro.substr(0, 500);

  nlohmann::json out;
  out["id"] = idClean;
  out["title"] = title.empty() ? "未命名作品" : title;
  out["author"] = author.empty() ? "佚名" : author;
  out["intro"] = intro;
  out["category"] = cats[0];
  out["categories"] = cats;
  out["tags"] = tags;
  out["status"] = src.value("status", "ongoing") == "done" ? "done" : "ongoing";
  out["visibility"] = src.value("visibility", "public") == "private" ? "private" : "public";
  out["cover"] = src.contains("cover") && src["cover"].is_object() ? src["cover"] : nlohmann::json(nullptr);
  out["account"] = src.value("account", "");
  out["signed"] = src.value("signed", "");
  out["createdAt"] = src.contains("createdAt") && src["createdAt"].is_string()
                         ? src["createdAt"].get<std::string>()
                         : nowIso();
  out["updatedAt"] = src.contains("updatedAt") && src["updatedAt"].is_string()
                         ? src["updatedAt"].get<std::string>()
                         : nowIso();
  return out;
}

/* ---------------- 打包 ---------------- */
bool bookPack(const nlohmann::json& book, const std::string& secret, bool wrapByPass,
              std::string& outJson, std::string& err) {
  if (secret.empty()) { err = "缺少加密密钥（私密书需要口令）"; return false; }

  nlohmann::json meta = normalizeBookMeta(book.value("meta", nlohmann::json::object()),
                                          book.value("id", std::string()));
  nlohmann::json chapters = nlohmann::json::array();
  size_t words = 0;
  int idx = 0;
  if (book.contains("chapters") && book["chapters"].is_array()) {
    for (auto& c : book["chapters"]) {
      idx++;
      std::string cid = c.value("id", "c" + std::to_string(idx));
      std::string title = c.value("title", "第 " + std::to_string(idx) + " 章");
      std::string content = c.value("content", "");
      words += countWords(content);
      chapters.push_back({{"id", cid}, {"title", title}, {"content", content}});
    }
  }
  meta["chapters"] = (int)chapters.size();
  meta["words"] = (int)words;

  // 公开摘要（列表页用，不含正文）
  nlohmann::json pub;
  for (const char* k : {"id", "title", "author", "intro", "category", "categories", "tags", "status",
                        "visibility"})
    pub[k] = meta.contains(k) ? meta[k] : nlohmann::json(nullptr);
  pub["cover"] = coverOf(meta);
  pub["chapters"] = (int)chapters.size();
  pub["words"] = (int)words;
  pub["createdAt"] = meta["createdAt"];
  pub["updatedAt"] = meta["updatedAt"];

  // 正文负载
  nlohmann::json payload;
  payload["meta"] = meta;
  payload["chapters"] = chapters;
  std::string plainStr = payload.dump();
  std::vector<uint8_t> plain(plainStr.begin(), plainStr.end());

  std::string zip = "none";
  auto gz = gzipCompress(plain);
  if (!gz.empty() && gz.size() < plain.size()) {
    plain = gz;
    zip = "gzip";
  }

  auto salt = randomBytes(16);
  if (salt.size() != 16) { err = "随机数生成失败"; return false; }
  auto kek = pbkdf2Sha256(secret, salt, kBookIter, 32);
  if (kek.size() != 32) { err = "PBKDF2 派生失败"; return false; }

  auto dek = randomBytes(32);
  auto wrapIv = randomBytes(12);
  auto dataIv = randomBytes(12);

  std::vector<uint8_t> wrapped;
  std::string e1;
  if (!aesGcmEncrypt(kek, wrapIv, dek, wrapped, e1)) { err = "包裹密钥失败：" + e1; return false; }
  std::vector<uint8_t> ct;
  std::string e2;
  if (!aesGcmEncrypt(dek, dataIv, plain, ct, e2)) { err = "正文加密失败：" + e2; return false; }

  nlohmann::json file;
  file["format"] = kBookFormat;
  file["v"] = kBookVersion;
  file["meta"] = pub;
  file["crypto"] = {
      {"alg", "AES-GCM"},
      {"kdf", "PBKDF2-SHA256"},
      {"iter", kBookIter},
      {"salt", b64encode(salt)},
      {"wrap", wrapByPass ? "pass" : "site"},
      {"wrapIv", b64encode(wrapIv)},
      {"wrapped", b64encode(wrapped)},
      {"zip", zip},
      {"dataIv", b64encode(dataIv)},
      {"data", b64encode(ct)},
  };
  outJson = file.dump();
  return true;
}

/* ---------------- 解包 ---------------- */
bool bookUnpack(const std::string& src, const std::string& secret, BookFile& out, std::string& err) {
  nlohmann::json file;
  try {
    file = nlohmann::json::parse(src);
  } catch (const std::exception&) {
    err = "文件格式错误：不是有效的 .book（JSON 解析失败）";
    return false;
  }
  if (file.value("format", "") != kBookFormat) {
    err = "文件格式错误：缺少 BookBlackNet 标识";
    return false;
  }
  if (!file.contains("crypto") || !file["crypto"].contains("data")) {
    err = "文件已损坏：缺少加密数据";
    return false;
  }
  auto& c = file["crypto"];
  std::string wrap = c.value("wrap", "site");
  if (secret.empty()) {
    err = wrap == "pass" ? "此书需要阅读口令（--password）" : "缺少站点密钥";
    return false;
  }
  auto salt = b64decode(c.value("salt", ""));
  int iter = c.value("iter", kBookIter);
  auto kek = pbkdf2Sha256(secret, salt, iter, 32);
  if (kek.size() != 32) { err = "PBKDF2 派生失败"; return false; }

  std::vector<uint8_t> rawDek;
  std::string e;
  if (!aesGcmDecrypt(kek, b64decode(c.value("wrapIv", "")), b64decode(c.value("wrapped", "")),
                     rawDek, e)) {
    err = wrap == "pass" ? "口令不正确" : "站点密钥不匹配，无法解开本书";
    return false;
  }
  std::vector<uint8_t> plain;
  if (!aesGcmDecrypt(rawDek, b64decode(c.value("dataIv", "")), b64decode(c.value("data", "")),
                     plain, e)) {
    err = "正文解密失败：文件可能被改动";
    return false;
  }
  if (c.value("zip", "none") == "gzip") {
    auto up = gzipDecompress(plain);
    if (up.empty()) { err = "解压失败：正文损坏"; return false; }
    plain = up;
  }

  nlohmann::json payload;
  try {
    payload = nlohmann::json::parse(std::string(plain.begin(), plain.end()));
  } catch (const std::exception&) {
    err = "正文解析失败：文件已损坏";
    return false;
  }

  out.file = file;
  out.meta = file.contains("meta") ? file["meta"] : nlohmann::json::object();
  if (payload.contains("meta") && payload["meta"].is_object())
    for (auto it = payload["meta"].begin(); it != payload["meta"].end(); ++it)
      out.meta[it.key()] = it.value();
  out.chapters = payload.value("chapters", nlohmann::json::array());
  out.words = 0;
  for (auto& ch : out.chapters) out.words += countWords(ch.value("content", ""));
  return true;
}

}  // namespace bn
