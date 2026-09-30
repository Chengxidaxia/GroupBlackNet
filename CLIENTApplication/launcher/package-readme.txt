群档案 · 桌面客户端
========================================

（版本号见本包所在的 zip 文件名，或右键 GroupBlackNet.exe → 属性 → 详细信息）

一、怎么用
  1. 把整个文件夹解压到任意位置（建议放 D://GroupBlackNet 这类纯英文路径）
  2. 双击 GroupBlackNet.exe
  3. 首次启动需要联网（加载文章、分类、公告）

二、运行环境
  · 需要电脑已安装 Java 21 或更高版本（JRE / JDK 都行）
    如果没装，双击时会弹出提示窗口，点里面的链接去 Adoptium 下载安装即可
  · 系统：Windows 10 / 11（64 位）

三、包里的两个程序有什么区别
  GroupBlackNet.exe         主程序。双击就用它 —— jar 已经打包在 exe 内部了，
                            单独拷这一个文件出去也能跑，旁边不需要放 jar。
  GroupBlackNet-Client.jar  备用。给不想用 exe 的人，或想在 Linux / macOS 上跑的人：
                              命令行执行  java -jar GroupBlackNet-Client.jar

四、常见问题
  Q: 提示 "An application instance is already running"？
  A: 程序只允许开一个窗口。先看任务栏是不是已经在运行；如果确实卡死了，
     在任务管理器里结束 GroupBlackNet.exe 和 javaw.exe，再重新打开。

  Q: 杀毒软件报毒 / 双击后一闪就没了？
  A: 启动器由 Launch4j 生成，个别杀软会误报，加白名单即可。
     实在不行可以不用 exe，改用  java -jar GroupBlackNet-Client.jar  启动。

  Q: 某些文章封面是空白的？
  A: 那篇文章的图床暂时不可用，程序会自动改用分类渐变封面，不影响阅读。

  Q: 第一次打开很慢？
  A: 首屏要拉取文章列表、分类和公告，等几秒即可；之后再开就快了。

五、命令行参数（可选）
  GroupBlackNet.exe --page=home|detail|editor|about|contact
  GroupBlackNet.exe --page=detail --d=43        直接打开 43 号文章
  GroupBlackNet.exe --theme=light|dark          指定主题（默认亮色）

项目主页：https://grp.blacknet.cc.cd
