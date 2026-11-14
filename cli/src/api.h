// api.h — 两站接口封装
#pragma once
#include <functional>
#include <string>
#include <vector>

#include "config.h"
#include "http.h"
#include "third_party/json.hpp"

namespace bn {

struct Ctx {
  Config cfg;
  Http http;
  std::string token;
};

Headers authHeaders(const Ctx& c);   // Cookie + Bearer（两端都认）

/* 通用：GET JSON */
bool httpJson(Ctx& c, const std::string& url, nlohmann::json& out, std::string& err, int* status = nullptr);
/* 通用：POST JSON */
bool httpPostJson(Ctx& c, const std::string& url, const nlohmann::json& body, nlohmann::json& out,
                  std::string& err, int* status = nullptr);

/* ---------------- 主站 ---------------- */
bool grpList(Ctx& c, int first, const std::string& after, nlohmann::json& out, std::string& err);
bool grpShow(Ctx& c, int number, int comments, nlohmann::json& out, std::string& err);
bool grpPost(Ctx& c, const std::string& title, const std::string& body, nlohmann::json& out,
             std::string& err);
bool grpComment(Ctx& c, const std::string& discussionId, const std::string& body,
                const std::string& replyTo, nlohmann::json& out, std::string& err);
bool grpReact(Ctx& c, const std::string& subjectId, const std::string& content, bool remove,
              nlohmann::json& out, std::string& err);
bool grpUpvote(Ctx& c, const std::string& subjectId, bool remove, nlohmann::json& out,
               std::string& err);
bool grpStatus(Ctx& c, nlohmann::json& out, std::string& err);
bool grpFeed(Ctx& c, int n, std::string& xml, std::string& err);
// 直接调 GitHub GraphQL（删除文章等没有 REST 封装的操作）
bool ghGraphQL(Ctx& c, const std::string& query, const nlohmann::json& vars, nlohmann::json& out,
               std::string& err);
bool grpDelete(Ctx& c, const std::string& discussionId, int number, std::string& err);

/* ---------------- 书阁 ---------------- */
// 书目索引（同源 → jsDelivr → raw 三层兜底）
bool bookIndex(Ctx& c, nlohmann::json& out, std::string& err);
// 取一本书的完整 .book 文本（自动处理分片清单）
bool bookFetch(Ctx& c, const std::string& id, const std::string& file, std::string& text,
               std::string& err, std::vector<std::string>* tried = nullptr);
// 发布：parts ≤2MiB，最后写清单
bool bookPublish(Ctx& c, const std::string& json, const nlohmann::json& entry, std::string& err,
                 std::function<void(int, int)> progress = nullptr);
bool bookCollections(Ctx& c, nlohmann::json& out, std::string& err);
bool bookCollectionSave(Ctx& c, const nlohmann::json& col, nlohmann::json& out, std::string& err);
bool bookCollectionDelete(Ctx& c, const std::string& id, nlohmann::json& out, std::string& err);
bool bookShelf(Ctx& c, nlohmann::json& out, std::string& err);

}  // namespace bn
