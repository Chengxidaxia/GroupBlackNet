#include "ui.h"

#include <windows.h>

#include <algorithm>
#include <cstdio>
#include <iostream>

#include "util.h"

namespace bn {

void uiInit() {
  SetConsoleOutputCP(CP_UTF8);
  SetConsoleCP(CP_UTF8);
  HANDLE h = GetStdHandle(STD_OUTPUT_HANDLE);
  if (h && h != INVALID_HANDLE_VALUE) {
    DWORD mode = 0;
    if (GetConsoleMode(h, &mode)) SetConsoleMode(h, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
  }
  // 非 tty 或 NO_COLOR 时关掉颜色，方便脚本抓输出
  if (std::getenv("NO_COLOR") || !_isatty(_fileno(stdout))) g.color = false;
  if (std::getenv("BLACKNET_JSON")) g.json = true;
}

static std::string wrap(const char* code, const std::string& s) {
  return g.color ? std::string(code) + s + "\x1b[0m" : s;
}

std::string cBold(const std::string& s) { return wrap("\x1b[1m", s); }
std::string cDim(const std::string& s) { return wrap("\x1b[2m", s); }
std::string cRed(const std::string& s) { return wrap("\x1b[31m", s); }
std::string cGreen(const std::string& s) { return wrap("\x1b[32m", s); }
std::string cYellow(const std::string& s) { return wrap("\x1b[33m", s); }
std::string cBlue(const std::string& s) { return wrap("\x1b[34m", s); }
std::string cCyan(const std::string& s) { return wrap("\x1b[36m", s); }

void printTable(const std::vector<std::string>& headers,
                const std::vector<std::vector<std::string>>& rows) {
  if (headers.empty()) return;
  size_t cols = headers.size();
  std::vector<size_t> w(cols, 0);
  for (size_t i = 0; i < cols; i++) w[i] = displayWidth(headers[i]);
  for (auto& r : rows)
    for (size_t i = 0; i < cols && i < r.size(); i++) w[i] = std::max(w[i], displayWidth(r[i]));

  std::string head;
  for (size_t i = 0; i < cols; i++) {
    head += (i ? "  " : "") + padRight(i + 1 == cols ? headers[i] : truncDisplay(headers[i], 60), w[i]);
  }
  std::cout << cDim(head) << "\n";
  size_t total = 0;
  for (size_t i = 0; i < cols; i++) total += w[i] + (i ? 2 : 0);
  std::cout << cDim(std::string(total, '-')) << "\n";
  for (auto& r : rows) {
    std::string line;
    for (size_t i = 0; i < cols; i++) {
      std::string cell = i < r.size() ? r[i] : "";
      line += (i ? "  " : "") + padRight(i + 1 == cols ? cell : truncDisplay(cell, 60), w[i]);
    }
    std::cout << line << "\n";
  }
}

int fail(int code, const std::string& message, const std::string& kind) {
  if (g.json) {
    nlohmann::json j;
    j["ok"] = false;
    j["error"] = message;
    j["kind"] = kind;
    j["exit"] = code;
    std::cout << j.dump(2) << "\n";
  } else {
    std::cerr << cRed("✗ " + message) << "\n";
  }
  return code;
}

void ok(const std::string& human) {
  if (!g.json) std::cout << human << "\n";
}

void ok(const std::string& human, const nlohmann::json& data) {
  if (g.json) {
    nlohmann::json j = data;
    j["ok"] = true;
    std::cout << j.dump(2) << "\n";
  } else {
    std::cout << human << "\n";
  }
}

void printHelp() {
  std::cout <<
      "bn — 群档案 / 群书阁 命令行客户端  v0.1.0\n"
      "\n"
      "用法：bn <域> <命令> [参数...]\n"
      "\n"
      "全局参数：--json 机器可读输出 · --no-color 关颜色 · -v 显示请求细节 · -y 跳过确认\n"
      "\n"
      "账号\n"
      "  bn login [--token T | --token-stdin]   用 GitHub 令牌登录（也可读 BLACKNET_TOKEN 环境变量）\n"
      "  bn whoami                              看当前登录身份\n"
      "  bn logout                              清除本机令牌\n"
      "\n"
      "主站 grp（grp.blacknet.cc.cd）\n"
      "  bn grp list [-n 20] [--after CURSOR] [--cat 分类]\n"
      "  bn grp show <编号> [--comments N]\n"
      "  bn grp search <关键词> [-n 50]\n"
      "  bn grp post -t 标题 -f 正文.md [--cat 技术] [--tags a,b] [--info 简介] [--dry]\n"
      "  bn grp comment <编号> (-m 内容 | -f 文件) [--reply 评论ID]\n"
      "  bn grp react <编号> <表情> [--remove]\n"
      "  bn grp upvote <编号> [--remove]\n"
      "  bn grp delete <编号>                   删除文章（不可恢复）\n"
      "  bn grp status                          服务状态\n"
      "  bn grp feed [-n 20]                    最新文章 RSS\n"
      "\n"
      "书阁 book（book.blacknet.cc.cd）\n"
      "  bn book list [--cat 分类] [--status done|ongoing] [--q 关键词]\n"
      "  bn book show <书号> [--chapter N] [--raw]\n"
      "  bn book search <关键词>\n"
      "  bn book get <书号> [-o 文件.book]\n"
      "  bn book unpack <文件.book> [-o 目录] [--password 口令]\n"
      "  bn book pack <目录> [-o 文件.book] [--meta meta.json] [--password 口令]\n"
      "  bn book publish <文件.book|目录> [--meta meta.json] [--dry]\n"
      "  bn book collections [list | show <id> | create | delete <id>]\n"
      "  bn book shelf                          云端书架\n"
      "\n"
      "示例：\n"
      "  bn login\n"
      "  bn grp list -n 5\n"
      "  bn grp post -t \"标题\" -f post.md --cat 技术 --tags CLI,工具\n"
      "  bn book publish ./mybook --meta ./meta.json\n"
      "\n"
      "配置文件：%USERPROFILE%\\.blacknet\\config.json（令牌用 DPAPI 加密存放）\n";
}

void printGrpHelp() {
  std::cout <<
      "bn grp — 主站命令\n"
      "\n"
      "  list     列出文章（-n 数量 / --after 游标 / --cat 分类名或ID）\n"
      "  show     看单篇（--comments N 附带评论）\n"
      "  search   关键词搜索（标题 + 正文 + 简介）\n"
      "  post     发稿（首行 JSON 自动生成）\n"
      "  comment  发评论（--reply 回复某条）\n"
      "  react    表情反应：+1/-1/laugh/hooray/confused/heart/rocket/eyes\n"
      "  upvote   点赞 / --remove 取消\n"
      "  delete   删除自己的文章（不可恢复，-y 跳过确认）\n"
      "  status   服务状态\n"
      "  feed     最新文章 RSS\n";
}

void printBookHelp() {
  std::cout <<
      "bn book — 书阁命令\n"
      "\n"
      "  list         书目（--cat 分类 / --status / --q 关键词）\n"
      "  show         读一本书（--chapter N 只看第 N 章，--raw 输出 Markdown）\n"
      "  search       在书名/简介/标签里搜\n"
      "  get          下载 .book 到本地\n"
      "  pack/unpack  .book 与「目录 + Markdown」互转\n"
      "  publish      发布/更新（.book 或目录均可，自动分片上传）\n"
      "  collections  作品集：list / show / create / delete\n"
      "  shelf        云端书架（需登录）\n";
}

}  // namespace bn
