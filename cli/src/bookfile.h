// bookfile.h — .book 文件格式（与 book/assets/js/core/crypto.js 完全同构）
#pragma once
#include <string>
#include <vector>

#include "third_party/json.hpp"

namespace bn {

constexpr int kBookVersion = 1;
constexpr int kBookIter = 310000;
constexpr const char* kBookFormat = "bookblacknet.book";

struct BookFile {
  nlohmann::json file;      // 完整 .book JSON
  nlohmann::json meta;      // 合并后的元信息
  nlohmann::json chapters;  // 数组
  size_t words = 0;
};

/* 打包：book 需含 meta 与 chapters:[{id,title,content}]；secret 为空则用站点密钥 */
bool bookPack(const nlohmann::json& book, const std::string& secret, bool wrapByPass,
              std::string& outJson, std::string& err);

/* 解包：src 为 .book 文本 */
bool bookUnpack(const std::string& src, const std::string& secret, BookFile& out, std::string& err);

/* 站点密钥（公开常量，来自 book/assets/js/config.js） */
std::string siteKey();

/* 元信息归一（与 normalizeMeta 一致） */
nlohmann::json normalizeBookMeta(const nlohmann::json& m, const std::string& fallbackId);
std::vector<std::string> cleanCats(const nlohmann::json& src);
size_t countWords(const std::string& markdown);
std::string newBookId();

}  // namespace bn
