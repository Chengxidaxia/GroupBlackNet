#include "config.h"

#include <windows.h>

#include <cstdlib>

#include "crypto.h"
#include "third_party/json.hpp"
#include "util.h"

namespace bn {

Global g;

std::string configPath() {
  static std::string p = homeDir() + "\\.blacknet\\config.json";
  return p;
}

static std::string envOr(const char* k) {
  const char* v = std::getenv(k);
  return v ? std::string(v) : std::string();
}

Config loadConfig() {
  Config c;
  c.path = configPath();
  // 环境变量可覆盖站点地址（自建部署 / 本地 mock 测试用）
  std::string gb = envOr("BLACKNET_GRP_BASE"), bb = envOr("BLACKNET_BOOK_BASE");
  if (!gb.empty()) c.grpBase = gb;
  if (!bb.empty()) c.bookBase = bb;
  std::string raw = readFile(c.path);
  if (raw.empty()) return c;
  try {
    auto j = nlohmann::json::parse(raw);
    if (j.contains("grp_base")) c.grpBase = j["grp_base"].get<std::string>();
    if (j.contains("book_base")) c.bookBase = j["book_base"].get<std::string>();
    if (j.contains("login")) c.login = j["login"].get<std::string>();
    if (j.contains("name")) c.name = j["name"].get<std::string>();
    if (j.contains("avatar")) c.avatar = j["avatar"].get<std::string>();
    if (j.contains("token_enc")) {
      std::string err;
      c.token = dpapiUnprotect(j["token_enc"].get<std::string>(), err);
    }
  } catch (const std::exception&) {
    // 配置坏了就当没有，别让 CLI 直接崩
  }
  return c;
}

bool saveConfig(const Config& c) {
  nlohmann::json j;
  j["grp_base"] = c.grpBase;
  j["book_base"] = c.bookBase;
  j["login"] = c.login;
  j["name"] = c.name;
  j["avatar"] = c.avatar;
  if (!c.token.empty()) {
    std::string err;
    std::string enc = dpapiProtect(c.token, err);
    if (!enc.empty()) j["token_enc"] = enc;
  }
  j["updated_at"] = nowIso();
  makeDirs(homeDir() + "\\.blacknet");
  return writeFile(c.path, j.dump(2) + "\n");
}

std::string resolveToken(const Config& cfg) {
  for (const char* k : {"BLACKNET_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"}) {
    std::string v = envOr(k);
    if (!v.empty()) return v;
  }
  return cfg.token;
}

}  // namespace bn
