// 群档案客户端 · 原生启动器
//
// 分发形态与 Mindustry / packr 一致：
//   GroupBlackNet.exe     本程序（原生，无控制台）
//   GroupBlackNet.json    配置（jrePath / classPath / mainClass / vmArgs）
//   GroupBlackNet.jar     应用本体
//   jre/                  便携运行时（jlink 裁剪，无需目标机装 Java）
//
// 行为：
//   - 读与 exe 同名的 .json
//   - 用 jrePath 下的 javaw.exe 启动 mainClass，工作目录固定为 exe 所在目录
//   - 单实例（命名互斥体），重复双击弹提示而不是开第二个窗口
//   - 找不到配置 / JRE / jar 时弹 MessageBox，而不是静默退出
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const (
	appTitle   = "群档案客户端"
	mutexName  = `Local\GroupBlackNetClientSingleInstance`
	mbIconErr  = 0x00000010 // MB_ICONERROR
	mbIconInfo = 0x00000040 // MB_ICONINFORMATION
)

var (
	kernel32         = syscall.NewLazyDLL("kernel32.dll")
	user32           = syscall.NewLazyDLL("user32.dll")
	procCreateMutexW = kernel32.NewProc("CreateMutexW")
	procMessageBoxW  = user32.NewProc("MessageBoxW")
)

// Config 对应 GroupBlackNet.json。
//
// 字段名、语义与 packr 的配置文件（K:\Play\Mindustry\Mindustry.json）保持一致：
//   jrePath / classPath / mainClass / useZgcIfSupportedOs / vmArgs
type Config struct {
	JrePath             string   `json:"jrePath"`
	ClassPath           []string `json:"classPath"`
	MainClass           string   `json:"mainClass"`
	UseZgcIfSupportedOs bool     `json:"useZgcIfSupportedOs"`
	VmArgs              []string `json:"vmArgs"`
}

func messageBox(text string, flags uint) {
	t, err := syscall.UTF16PtrFromString(text)
	if err != nil {
		return
	}
	c, err := syscall.UTF16PtrFromString(appTitle)
	if err != nil {
		return
	}
	procMessageBoxW.Call(0,
		uintptr(unsafe.Pointer(t)),
		uintptr(unsafe.Pointer(c)),
		uintptr(flags))
}

func main() {
	// ---- 单实例 ----
	name, _ := syscall.UTF16PtrFromString(mutexName)
	h, _, err := procCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(name)))
	if h == 0 {
		messageBox("无法创建进程互斥体：\n"+errText(err), mbIconErr)
		return
	}
	defer kernel32.NewProc("CloseHandle").Call(h)

	const errAlreadyExists syscall.Errno = 183
	if e, ok := err.(syscall.Errno); ok && e == errAlreadyExists {
		messageBox("客户端已经在运行了。\n\n如果要重启，请先关闭已打开的窗口。", mbIconInfo)
		return
	}

	// ---- 定位自身与配置 ----
	exePath, err := os.Executable()
	if err != nil {
		messageBox("无法定位程序自身路径：\n"+err.Error(), mbIconErr)
		return
	}
	if real, e := filepath.EvalSymlinks(exePath); e == nil {
		exePath = real
	}
	baseDir := filepath.Dir(exePath)
	jsonPath := strings.TrimSuffix(exePath, filepath.Ext(exePath)) + ".json"

	raw, err := os.ReadFile(jsonPath)
	if err != nil {
		messageBox("找不到配置文件：\n"+jsonPath+
			"\n\n请确认 exe 与 json 在同一目录，且文件名相同。", mbIconErr)
		return
	}

	var cfg Config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		messageBox("配置文件格式错误：\n"+jsonPath+"\n\n"+err.Error(), mbIconErr)
		return
	}
	if strings.TrimSpace(cfg.MainClass) == "" {
		messageBox("配置缺少 mainClass 字段：\n"+jsonPath, mbIconErr)
		return
	}
	if len(cfg.ClassPath) == 0 {
		messageBox("配置缺少 classPath 字段：\n"+jsonPath, mbIconErr)
		return
	}

	// ---- classpath 转绝对路径（相对 exe 目录，与当前工作目录无关）----
	entries := make([]string, 0, len(cfg.ClassPath))
	for _, p := range cfg.ClassPath {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		abs := p
		if !filepath.IsAbs(abs) {
			abs = filepath.Join(baseDir, abs)
		}
		if st, err := os.Stat(abs); err != nil || st.IsDir() {
			messageBox("找不到依赖文件：\n"+abs+
				"\n\n请确认 jar 与 exe 在同一目录。", mbIconErr)
			return
		}
		entries = append(entries, abs)
	}

	// ---- 定位 Java ----
	javaPath, err := resolveJava(baseDir, cfg)
	if err != nil {
		messageBox(err.Error()+fmt.Sprintf(
			"\n\n已尝试：\n  %s\n\n"+
				"如果是解压不完整，请重新解压全部文件（jre 目录不能少）。",
			filepath.Join(baseDir, cfg.JrePath, "bin", "javaw.exe")), mbIconErr)
		return
	}

	// ---- 拼参数并启动 ----
	args := make([]string, 0, len(cfg.VmArgs)+6+len(os.Args))
	if cfg.UseZgcIfSupportedOs {
		// 与 packr 的 useZgcIfSupportedOs 对齐：JDK 21 起 ZGC 已是正式特性，无需 UnlockExperimentalVMOptions
		args = append(args, "-XX:+UseZGC")
	}
	args = append(args, cfg.VmArgs...)
	args = append(args, "-cp", strings.Join(entries, ";"))
	args = append(args, cfg.MainClass)
	args = append(args, os.Args[1:]...)

	cmd := exec.Command(javaPath, args...)
	cmd.Dir = baseDir

	// 把子进程的输出落到日志文件：javaw 没有控制台，异常信息否则会彻底丢失。
	logPath := logFilePath(baseDir)
	logf, logErr := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if logErr == nil {
		defer logf.Close()
		cmd.Stdout = logf
		cmd.Stderr = logf
		fmt.Fprintf(logf, "=== %s ===\njava: %s\ncwd: %s\nargs: %q\n\n",
			timeNow(), javaPath, baseDir, args)
	}

	if err := cmd.Start(); err != nil {
		messageBox("启动 Java 失败：\n"+javaPath+"\n\n"+err.Error(), mbIconErr)
		return
	}

	// 等待子进程，透传退出码（-H=windowsgui 下父进程常驻，占用极小）
	if err := cmd.Wait(); err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			code := ee.ExitCode()
			if logErr == nil {
				fmt.Fprintf(logf, "\n[%s] 子进程退出，退出码 %d\n", timeNow(), code)
			}
			if code != 0 {
				messageBox(fmt.Sprintf("客户端异常退出（退出码 %d）。\n\n"+
					"详细日志：\n%s", code, logPath), mbIconErr)
			}
			os.Exit(code)
		}
		os.Exit(1)
	}
}

// resolveJava 依次尝试：jrePath 下的 javaw → java → 系统 PATH 里的 javaw → java。
func resolveJava(baseDir string, cfg Config) (string, error) {
	if p := strings.TrimSpace(cfg.JrePath); p != "" {
		if !filepath.IsAbs(p) {
			p = filepath.Join(baseDir, p)
		}
		for _, exe := range []string{"javaw.exe", "java.exe"} {
			cand := filepath.Join(p, "bin", exe)
			if st, err := os.Stat(cand); err == nil && !st.IsDir() {
				return cand, nil
			}
		}
	}
	for _, exe := range []string{"javaw.exe", "java.exe"} {
		if cand, err := exec.LookPath(exe); err == nil {
			return cand, nil
		}
	}
	return "", fmt.Errorf("找不到可用的 Java 运行时（jrePath = %q）", cfg.JrePath)
}

func errText(err error) string {
	if err == nil {
		return "未知错误"
	}
	return err.Error()
}

func timeNow() string {
	return time.Now().Format("2006-01-02 15:04:05")
}

// logFilePath 优先写在 exe 同目录，不可写（例如装在 Program Files）时退到临时目录。
func logFilePath(baseDir string) string {
	candidate := filepath.Join(baseDir, "GroupBlackNet.log")
	if f, err := os.OpenFile(candidate, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644); err == nil {
		f.Close()
		return candidate
	}
	return filepath.Join(os.TempDir(), "GroupBlackNet.log")
}
