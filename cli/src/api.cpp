#include "api.h"

#include <algorithm>
#include <cstdio>

#include "util.h"

namespace bn {

static const char* kUA = "BlackNet-CLI/0.1 (+https://grp.blacknet.cc.cd)";

Headers authHeaders(const Ctx& c) {
  Headers h;
  h.push_back({"User-Agent", kUA});
  h.push_back({"Accept", "application/json"});
  if (!c.token.empty()) {
    h.push_back({"Authorization", "Bearer " + c.token});
    h.push_back({"Cookie", "github_token=" + c.token});
  }
  return h;
}

static std::string apiErrText(const HttpResponse& r) {
  // 尽量把后端的 error 字段抠出来
  try {
    auto j = nlohmann::json::parse(r.body);
    if (j.contains("error")) return j["error"].get<std::string>();
    if (j.contains("message")) return j["message"].get<std::string>();
  } catch (const std::exception&) {
  }
  return r.body.substr(0, 300);
}

bool httpJson(Ctx& c, const std::string& url, nlohmann::json& out, std::string& err, int* status) {
  HttpResponse r = c.http.get(url, authHeaders(c));
  if (status) *status = r.status;
  if (!r.error.empty()) { err = "网络错误：" + r.error + " ← " + url; return false; }
  try {
    out = nlohmann::json::parse(r.body);
  } catch (const std::exception&) {
    err = "响应不是 JSON（HTTP " + std::to_string(r.status) + "）：" + r.body.substr(0, 200);
    return false;
  }
  if (r.status < 200 || r.status >= 300) {
    err = apiErrText(r) + "（HTTP " + std::to_string(r.status) + "）";
    return false;
  }
  return true;
}

bool httpPostJson(Ctx& c, const std::string& url, const nlohmann::json& body, nlohmann::json& out,
                  std::string& err, int* status) {
  HttpResponse r = c.http.post(url, body.dump(), "application/json", authHeaders(c));
  if (status) *status = r.status;
  if (!r.error.empty()) { err = "网络错误：" + r.error + " ← " + url; return false; }
  if (r.body.empty()) {
    if (r.status >= 200 && r.status < 300) { out = nlohmann::json::object(); return true; }
    err = "空响应（HTTP " + std::to_string(r.status) + "）";
    return false;
  }
  try {
    out = nlohmann::json::parse(r.body);
  } catch (const std::exception&) {
    err = "响应不是 JSON（HTTP " + std::to_string(r.status) + "）：" + r.body.substr(0, 200);
    return false;
  }
  if (r.status < 200 || r.status >= 300) {
    err = apiErrText(r) + "（HTTP " + std::to_string(r.status) + "）";
    return false;
  }
  return true;
}

/* ================= 主站 ================= */
bool grpList(Ctx& c, int first, const std::string& after, nlohmann::json& out, std::string& err) {
  std::string url = c.cfg.grpBase + "/api/discussions?first=" + std::to_string(first);
  if (!after.empty()) url += "&after=" + after;
  return httpJson(c, url, out, err);
}

bool grpShow(Ctx& c, int number, int comments, nlohmann::json& out, std::string& err) {
  std::string url = c.cfg.grpBase + "/api/discussions?d=" + std::to_string(number) +
                    "&cfirst=" + std::to_string(comments);
  return httpJson(c, url, out, err);
}

bool grpPost(Ctx& c, const std::string& title, const std::string& body, nlohmann::json& out,
             std::string& err) {
  nlohmann::json req{{"title", title}, {"body", body}};
  return httpPostJson(c, c.cfg.grpBase + "/api/oauth/discussion", req, out, err);
}

bool grpComment(Ctx& c, const std::string& discussionId, const std::string& body,
                const std::string& replyTo, nlohmann::json& out, std::string& err) {
  nlohmann::json req{{"discussionId", discussionId}, {"body", body}};
  if (!replyTo.empty()) req["parentCommentId"] = replyTo;
  return httpPostJson(c, c.cfg.grpBase + "/api/oauth/comment", req, out, err);
}

bool grpReact(Ctx& c, const std::string& subjectId, const std::string& content, bool remove,
              nlohmann::json& out, std::string& err) {
  nlohmann::json req{{"subjectId", subjectId}, {"content", content}, {"action", remove ? "remove" : "add"}};
  return httpPostJson(c, c.cfg.grpBase + "/api/oauth/reaction", req, out, err);
}

bool grpUpvote(Ctx& c, const std::string& subjectId, bool remove, nlohmann::json& out,
               std::string& err) {
  nlohmann::json req{{"subjectId", subjectId}, {"action", remove ? "remove" : "add"}};
  return httpPostJson(c, c.cfg.grpBase + "/api/oauth/upvote", req, out, err);
}

bool grpStatus(Ctx& c, nlohmann::json& out, std::string& err) {
  return httpJson(c, c.cfg.grpBase + "/api/status", out, err);
}

bool grpFeed(Ctx& c, int n, std::string& xml, std::string& err) {
  HttpResponse r = c.http.get(c.cfg.grpBase + "/feed.xml", {{"User-Agent", kUA}});
  if (!r.error.empty()) { err = "网络错误：" + r.error; return false; }
  if (r.status != 200) { err = "HTTP " + std::to_string(r.status); return false; }
  xml = r.body;
  (void)n;
  return true;
}

bool ghGraphQL(Ctx& c, const std::string& query, const nlohmann::json& vars, nlohmann::json& out,
               std::string& err) {
  nlohmann::json req{{"query", query}, {"variables", vars}};
  HttpResponse r = c.http.post("https://api.github.com/graphql", req.dump(), "application/json",
                              {{"User-Agent", kUA},
                               {"Authorization", "Bearer " + c.token},
                               {"Accept", "application/vnd.github+json"}});
  if (!r.error.empty()) { err = "网络错误：" + r.error; return false; }
  try {
    out = nlohmann::json::parse(r.body);
  } catch (const std::exception&) {
    err = "GraphQL 响应不是 JSON（HTTP " + std::to_string(r.status) + "）";
    return false;
  }
  if (out.contains("errors") && !out["errors"].empty()) {
    err = out["errors"][0].value("message", "GraphQL 调用失败");
    return false;
  }
  if (r.status < 200 || r.status >= 300) {
    err = "HTTP " + std::to_string(r.status);
    return false;
  }
  return true;
}

bool grpDelete(Ctx& c, const std::string& discussionId, int number, std::string& err) {
  (void)number;
  nlohmann::json out;
  const std::string q =
      "mutation($id:ID!){deleteDiscussion(input:{id:$id}){discussion{number title}}}";
  return ghGraphQL(c, q, nlohmann::json{{"id", discussionId}}, out, err);
}

/* ================= 书阁 ================= */

// 三层数据源：同源 → jsDelivr → raw
static std::vector<std::string> bookSources(const Ctx& c, const std::string& rel) {
  std::string clean = rel;
  while (!clean.empty() && clean[0] == '/') clean.erase(clean.begin());
  return {
      c.cfg.bookBase + "/" + clean,
      "https://cdn.jsdelivr.net/gh/Chengxidaxia/BookBlackNet@main/" + clean,
      "https://raw.githubusercontent.com/Chengxidaxia/BookBlackNet/main/" + clean,
  };
}

static bool fetchBookText(Ctx& c, const std::string& rel, std::string& text, std::string& err,
                          std::vector<std::string>* tried = nullptr) {
  std::string lastErr;
  for (auto& url : bookSources(c, rel)) {
    HttpResponse r = c.http.get(url, {{"User-Agent", kUA}}, 20000);
    if (tried) tried->push_back(url + " → " + (r.error.empty() ? std::to_string(r.status) : r.error));
    if (!r.error.empty()) { lastErr = r.error; continue; }
    if (r.status == 200 && !r.body.empty()) {
      text = r.body;
      return true;
    }
    lastErr = "HTTP " + std::to_string(r.status) + " ← " + url;
  }
  err = "取不到 " + rel + "：" + lastErr;
  return false;
}

bool bookIndex(Ctx& c, nlohmann::json& out, std::string& err) {
  std::string text;
  if (!fetchBookText(c, "docs/books/index.json", text, err)) return false;
  try {
    out = nlohmann::json::parse(text);
  } catch (const std::exception&) {
    err = "书目索引不是合法 JSON";
    return false;
  }
  return true;
}

bool bookFetch(Ctx& c, const std::string& id, const std::string& file, std::string& text,
               std::string& err, std::vector<std::string>* tried) {
  std::string name = file.empty() ? (id + ".book") : file;
  std::string body;
  if (!fetchBookText(c, "docs/books/" + name, body, err, tried)) return false;

  // 分片清单？
  nlohmann::json j;
  try {
    j = nlohmann::json::parse(body);
  } catch (const std::exception&) {
    text = body;
    return true;
  }
  if (j.value("format", "") != "bookblacknet.chunks") {
    text = body;
    return true;
  }

  std::string all;
  auto parts = j.value("parts", std::vector<std::string>{});
  if (parts.empty()) { err = "清单里没有分片"; return false; }
  for (auto& p : parts) {
    std::string seg;
    if (!fetchBookText(c, "docs/books/" + p, seg, err, tried)) return false;
    all += seg;
  }
  text = all;
  return true;
}

bool bookPublish(Ctx& c, const std::string& json, const nlohmann::json& entry, std::string& err,
                 std::function<void(int, int)> progress) {
  const size_t kPart = 2 * 1024 * 1024;  // 与 lib/gh-publish.mjs 的 PART_MAX 一致
  std::vector<std::string> parts;
  size_t pos = 0;
  while (pos < json.size()) {
    size_t end = std::min(pos + kPart, json.size());
    // 不要在 UTF-8 多字节字符中间切
    while (end < json.size() && ((unsigned char)json[end] & 0xC0) == 0x80) end--;
    parts.push_back(json.substr(pos, end - pos));
    pos = end;
  }
  if (parts.empty()) parts.push_back("");

  std::string id = entry.value("id", "");
  std::string file = entry.value("file", id + ".book");
  int total = (int)parts.size();

  for (int i = 0; i < total; i++) {
    nlohmann::json req{{"file", file}, {"seq", i + 1}, {"total", total}, {"text", parts[(size_t)i]}};
    nlohmann::json out;
    int status = 0;
    if (!httpPostJson(c, c.cfg.bookBase + "/api/publish", req, out, err, &status)) {
      err = "第 " + std::to_string(i + 1) + "/" + std::to_string(total) + " 片上传失败：" + err;
      return false;
    }
    if (progress) progress(i + 1, total);
  }

  nlohmann::json fin{{"file", file}, {"final", 1}, {"total", total}, {"size", (long long)json.size()},
                     {"entry", entry}};
  nlohmann::json out;
  return httpPostJson(c, c.cfg.bookBase + "/api/publish", fin, out, err);
}

bool bookCollections(Ctx& c, nlohmann::json& out, std::string& err) {
  std::string text;
  if (!fetchBookText(c, "docs/collections/index.json", text, err)) return false;
  try {
    out = nlohmann::json::parse(text);
  } catch (const std::exception&) {
    err = "作品集索引不是合法 JSON";
    return false;
  }
  return true;
}

bool bookCollectionSave(Ctx& c, const nlohmann::json& col, nlohmann::json& out, std::string& err) {
  nlohmann::json req{{"collection", col}};
  return httpPostJson(c, c.cfg.bookBase + "/api/collections", req, out, err);
}

bool bookCollectionDelete(Ctx& c, const std::string& id, nlohmann::json& out, std::string& err) {
  HttpResponse r = c.http.del(c.cfg.bookBase + "/api/collections?id=" + id, authHeaders(c));
  if (!r.error.empty()) { err = "网络错误：" + r.error; return false; }
  try {
    out = nlohmann::json::parse(r.body);
  } catch (const std::exception&) {
    err = "响应不是 JSON（HTTP " + std::to_string(r.status) + "）";
    return false;
  }
  if (r.status < 200 || r.status >= 300) {
    err = apiErrText(r) + "（HTTP " + std::to_string(r.status) + "）";
    return false;
  }
  return true;
}

bool bookShelf(Ctx& c, nlohmann::json& out, std::string& err) {
  return httpJson(c, c.cfg.bookBase + "/api/shelf", out, err);
}

}  // namespace bn
