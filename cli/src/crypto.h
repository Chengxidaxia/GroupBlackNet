// crypto.h — BCrypt 封装：随机数、PBKDF2-SHA256、AES-256-GCM
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace bn {

std::vector<uint8_t> randomBytes(size_t n);

// PBKDF2-HMAC-SHA256
std::vector<uint8_t> pbkdf2Sha256(const std::string& password, const std::vector<uint8_t>& salt,
                                  int iterations, size_t outLen);

// AES-256-GCM：返回 密文||tag(16)
bool aesGcmEncrypt(const std::vector<uint8_t>& key, const std::vector<uint8_t>& iv,
                   const std::vector<uint8_t>& plain, std::vector<uint8_t>& out,
                   std::string& err);

// 输入 密文||tag(16)
bool aesGcmDecrypt(const std::vector<uint8_t>& key, const std::vector<uint8_t>& iv,
                   const std::vector<uint8_t>& in, std::vector<uint8_t>& out, std::string& err);

// DPAPI：给本机当前用户加密一段数据（用于存 token）
std::string dpapiProtect(const std::string& plain, std::string& err);
std::string dpapiUnprotect(const std::string& b64blob, std::string& err);

}  // namespace bn
