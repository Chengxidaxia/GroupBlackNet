#include "crypto.h"

#include <windows.h>
#include <bcrypt.h>
#include <dpapi.h>

#include <cstring>

#include "util.h"

#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "crypt32.lib")

namespace bn {

static std::string ntStatusText(const char* what, NTSTATUS st) {
  char buf[128];
  snprintf(buf, sizeof(buf), "%s 失败（NTSTATUS 0x%08lX）", what, (unsigned long)st);
  return buf;
}

std::vector<uint8_t> randomBytes(size_t n) {
  std::vector<uint8_t> out(n);
  if (n && !BCRYPT_SUCCESS(BCryptGenRandom(nullptr, out.data(), (ULONG)n,
                                          BCRYPT_USE_SYSTEM_PREFERRED_RNG)))
    out.clear();
  return out;
}

std::vector<uint8_t> pbkdf2Sha256(const std::string& password, const std::vector<uint8_t>& salt,
                                  int iterations, size_t outLen) {
  BCRYPT_ALG_HANDLE hAlg = nullptr;
  // PBKDF2 要 HMAC 模式的 PRF
  if (!BCRYPT_SUCCESS(BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, nullptr,
                                                  BCRYPT_ALG_HANDLE_HMAC_FLAG)))
    return {};
  std::vector<uint8_t> out(outLen);
  NTSTATUS st = BCryptDeriveKeyPBKDF2(
      hAlg, (PUCHAR)password.data(), (ULONG)password.size(),
      salt.empty() ? nullptr : const_cast<PUCHAR>(salt.data()), (ULONG)salt.size(),
      (ULONGLONG)iterations, out.data(), (ULONG)outLen, 0);
  BCryptCloseAlgorithmProvider(hAlg, 0);
  if (!BCRYPT_SUCCESS(st)) return {};
  return out;
}

static BCRYPT_ALG_HANDLE openAes() {
  BCRYPT_ALG_HANDLE hAlg = nullptr;
  if (!BCRYPT_SUCCESS(BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_AES_ALGORITHM, nullptr, 0)))
    return nullptr;
  if (!BCRYPT_SUCCESS(BCryptSetProperty(hAlg, BCRYPT_CHAINING_MODE, (PUCHAR)BCRYPT_CHAIN_MODE_GCM,
                                        sizeof(BCRYPT_CHAIN_MODE_GCM), 0))) {
    BCryptCloseAlgorithmProvider(hAlg, 0);
    return nullptr;
  }
  return hAlg;
}

bool aesGcmEncrypt(const std::vector<uint8_t>& key, const std::vector<uint8_t>& iv,
                   const std::vector<uint8_t>& plain, std::vector<uint8_t>& out, std::string& err) {
  BCRYPT_ALG_HANDLE hAlg = openAes();
  if (!hAlg) { err = "打开 AES 算法失败"; return false; }
  BCRYPT_KEY_HANDLE hKey = nullptr;
  NTSTATUS st = BCryptGenerateSymmetricKey(hAlg, &hKey, nullptr, 0, (PUCHAR)key.data(),
                                           (ULONG)key.size(), 0);
  if (!BCRYPT_SUCCESS(st)) {
    err = ntStatusText("导入密钥", st);
    BCryptCloseAlgorithmProvider(hAlg, 0);
    return false;
  }

  std::vector<uint8_t> tag(16);
  out.resize(plain.size());
  BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO info;
  BCRYPT_INIT_AUTH_MODE_INFO(info);
  info.pbNonce = const_cast<PUCHAR>(iv.data());
  info.cbNonce = (ULONG)iv.size();
  info.pbTag = tag.data();
  info.cbTag = 16;

  ULONG written = 0;
  st = BCryptEncrypt(hKey, plain.empty() ? nullptr : const_cast<PUCHAR>(plain.data()),
                     (ULONG)plain.size(), &info, nullptr, 0,
                     plain.empty() ? nullptr : out.data(), (ULONG)out.size(), &written, 0);
  BCryptDestroyKey(hKey);
  BCryptCloseAlgorithmProvider(hAlg, 0);
  if (!BCRYPT_SUCCESS(st)) { err = ntStatusText("AES-GCM 加密", st); return false; }
  out.resize(written);
  out.insert(out.end(), tag.begin(), tag.end());
  return true;
}

bool aesGcmDecrypt(const std::vector<uint8_t>& key, const std::vector<uint8_t>& iv,
                   const std::vector<uint8_t>& in, std::vector<uint8_t>& out, std::string& err) {
  if (in.size() < 16) { err = "密文长度不足"; return false; }
  BCRYPT_ALG_HANDLE hAlg = openAes();
  if (!hAlg) { err = "打开 AES 算法失败"; return false; }
  BCRYPT_KEY_HANDLE hKey = nullptr;
  NTSTATUS st = BCryptGenerateSymmetricKey(hAlg, &hKey, nullptr, 0, (PUCHAR)key.data(),
                                           (ULONG)key.size(), 0);
  if (!BCRYPT_SUCCESS(st)) {
    err = ntStatusText("导入密钥", st);
    BCryptCloseAlgorithmProvider(hAlg, 0);
    return false;
  }

  size_t ctLen = in.size() - 16;
  std::vector<uint8_t> tag(in.end() - 16, in.end());
  out.resize(ctLen);
  BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO info;
  BCRYPT_INIT_AUTH_MODE_INFO(info);
  info.pbNonce = const_cast<PUCHAR>(iv.data());
  info.cbNonce = (ULONG)iv.size();
  info.pbTag = tag.data();
  info.cbTag = 16;

  ULONG written = 0;
  st = BCryptDecrypt(hKey, ctLen ? const_cast<PUCHAR>(in.data()) : nullptr, (ULONG)ctLen, &info,
                     nullptr, 0, ctLen ? out.data() : nullptr, (ULONG)out.size(), &written, 0);
  BCryptDestroyKey(hKey);
  BCryptCloseAlgorithmProvider(hAlg, 0);
  if (!BCRYPT_SUCCESS(st)) { err = ntStatusText("AES-GCM 解密（密钥或数据不匹配）", st); return false; }
  out.resize(written);
  return true;
}

/* ---------------- DPAPI ---------------- */
std::string dpapiProtect(const std::string& plain, std::string& err) {
  DATA_BLOB in{(DWORD)plain.size(), (BYTE*)plain.data()};
  DATA_BLOB out{0, nullptr};
  if (!CryptProtectData(&in, L"BlackNet CLI token", nullptr, nullptr, nullptr,
                        CRYPTPROTECT_UI_FORBIDDEN, &out)) {
    err = "DPAPI 加密失败（Win32 " + std::to_string(GetLastError()) + "）";
    return "";
  }
  std::string blob((char*)out.pbData, out.cbData);
  LocalFree(out.pbData);
  return b64encode(blob);
}

std::string dpapiUnprotect(const std::string& b64blob, std::string& err) {
  std::vector<uint8_t> raw = b64decode(b64blob);
  if (raw.empty()) { err = "令牌密文为空"; return ""; }
  DATA_BLOB in{(DWORD)raw.size(), raw.data()};
  DATA_BLOB out{0, nullptr};
  if (!CryptUnprotectData(&in, nullptr, nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &out)) {
    err = "DPAPI 解密失败（换过机器或用户？）";
    return "";
  }
  std::string plain((char*)out.pbData, out.cbData);
  LocalFree(out.pbData);
  return plain;
}

}  // namespace bn
