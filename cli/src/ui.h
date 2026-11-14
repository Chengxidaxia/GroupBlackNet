// ui.h — 终端输出：颜色、表格、错误
#pragma once
#include <string>
#include <vector>

#include "config.h"
#include "third_party/json.hpp"

namespace bn {

void uiInit();   // 打开 UTF-8 与 VT 转义

std::string cBold(const std::string& s);
std::string cDim(const std::string& s);
std::string cRed(const std::string& s);
std::string cGreen(const std::string& s);
std::string cYellow(const std::string& s);
std::string cBlue(const std::string& s);
std::string cCyan(const std::string& s);

void printTable(const std::vector<std::string>& headers,
                const std::vector<std::vector<std::string>>& rows);

/* 失败输出并返回退出码（json 模式输出 {"ok":false,...}） */
int fail(int code, const std::string& message, const std::string& kind = "error");

/* 成功输出：json 模式打印 data，否则打印 human */
void ok(const std::string& human);
void ok(const std::string& human, const nlohmann::json& data);

/* 子命令帮助 */
void printHelp();
void printGrpHelp();
void printBookHelp();

/* 退出码约定 */
enum ExitCode {
  EX_OK = 0,
  EX_FAIL = 1,
  EX_USAGE = 2,
  EX_AUTH = 3,
  EX_NET = 4,
  EX_NOTFOUND = 5,
  EX_CONFLICT = 6,
};

}  // namespace bn
