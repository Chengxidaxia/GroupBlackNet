# bn — BlackNet CLI（C++17，零第三方运行时依赖）
# 依赖：mingw-w64 g++、WinHTTP、BCrypt、zlib（均随 MSYS2 提供）

CXX      ?= /k/Programs/msys64/mingw64/bin/g++
CXXFLAGS ?= -std=c++17 -O2 -pipe -I. -Wall -Wextra -Wno-unused-parameter -Wno-missing-field-initializers -Wno-unknown-pragmas
LDFLAGS  ?= -pipe -static -s
LIBS     ?= -lwinhttp -lbcrypt -lcrypt32 -lshell32 -lz

# gcc 的临时文件默认写 C://Windows//（本机沙箱不允许）→ 固定到 build/tmp
export TMPDIR := K:/GroupBlackNet/cli/build/tmp
export TMP    := K:/GroupBlackNet/cli/build/tmp
export TEMP   := K:/GroupBlackNet/cli/build/tmp

SRC_DIR  := src
OBJ_DIR  := build
TARGET   := build/bn.exe

SRCS := $(wildcard $(SRC_DIR)/*.cpp)
OBJS := $(patsubst $(SRC_DIR)/%.cpp,$(OBJ_DIR)/%.o,$(SRCS))

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(OBJS) -o $@ $(LDFLAGS) $(LIBS)

$(OBJ_DIR)/%.o: $(SRC_DIR)/%.cpp
	@mkdir -p $(OBJ_DIR) $(OBJ_DIR)/tmp
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	rm -f $(OBJ_DIR)/*.o $(TARGET)

.PHONY: all clean
