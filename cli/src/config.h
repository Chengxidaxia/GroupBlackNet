// config.h — 本地配置与令牌
#pragma once
#include <string>

namespace bn {

struct Config {
  std::string grpBase = "https://grp.blacknet.cc.cd";
  std::string bookBase = "https://book.blacknet.cc.cd";
  std::string token;   // 运行时明文
  std::string login;
  std::string name;
  std::string avatar;
  std::string path;    // 配置文件路径
};

Config loadConfig();
bool saveConfig(const Config& cfg);
std::string configPath();

/* 令牌来源优先级：环境变量 → 配置文件 */
std::string resolveToken(const Config& cfg);

/* 运行期全局开关 */
struct Global {
  bool json = false;
  bool color = true;
  bool verbose = false;
  bool yes = false;
};
extern Global g;

}  // namespace bn
