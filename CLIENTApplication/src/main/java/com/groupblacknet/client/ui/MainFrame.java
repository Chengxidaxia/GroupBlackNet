package com.groupblacknet.client.ui;

import com.groupblacknet.client.core.Api;
import com.groupblacknet.client.core.Config;
import com.groupblacknet.client.core.MetaParser;
import com.groupblacknet.client.core.Model;
import com.groupblacknet.client.core.Session;
import com.groupblacknet.client.core.Theme;

import java.awt.*;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.util.ArrayList;
import java.util.List;

import javax.swing.*;

/**
 * 主窗口：顶部工具栏（品牌 / 导航 / 写稿 / 登录 / 主题）+ 公告条 + CardLayout 页面路由 + 轻提示。
 * 默认亮色主题（见 Theme）。
 */
public class MainFrame extends JFrame {

    private final CardLayout cards = new CardLayout();
    private final JPanel deck = new JPanel(cards);

    private HomePanel home;
    private DetailPanel detail;
    private EditorPanel editor;
    private AboutPanel aboutPanel;
    private ContactPanel contactPanel;

    private JPanel bar;
    private JPanel brandBox;
    private TickerBar ticker;
    private JButton writeBtn;
    private JButton loginBtn;
    private JButton themeBtn;
    private JLabel navHome, navAbout, navContact;

    private String toastMsg;
    private Timer toastTimer;

    public MainFrame() {
        super("群档案 · 客户端");
        setDefaultCloseOperation(EXIT_ON_CLOSE);
        setMinimumSize(new Dimension(1020, 700));
        setSize(1320, 880);
        setLocationRelativeTo(null);

        JPanel root = new JPanel(new BorderLayout());
        root.setBackground(Theme.t().bg);
        root.putClientProperty("gbBg", "bg");
        Ui.themed(root, t -> t.bg);

        buildToolbar();

        JPanel north = new JPanel(new BorderLayout());
        north.setOpaque(false);
        north.add(bar, BorderLayout.NORTH);
        ticker = new TickerBar();
        north.add(ticker, BorderLayout.SOUTH);
        root.add(north, BorderLayout.NORTH);

        deck.setOpaque(true);
        deck.setBackground(Theme.t().bg);
        deck.putClientProperty("gbBg", "bg");
        deck.add(home = new HomePanel(this), "home");
        deck.add(detail = new DetailPanel(this), "detail");
        deck.add(editor = new EditorPanel(this), "editor");
        deck.add(aboutPanel = new AboutPanel(this), "about");
        deck.add(contactPanel = new ContactPanel(this), "contact");
        root.add(deck, BorderLayout.CENTER);

        setContentPane(root);
        installToast();
        Ui.setToastHook(this::toast);

        Theme.onChange(this::onThemeChanged);
        loadBootData();
        refreshLoginUi();
        showHome();
    }

    /* ---------------- 工具栏 ---------------- */

    private void buildToolbar() {
        bar = new JPanel(new BorderLayout());
        bar.setBorder(BorderFactory.createEmptyBorder(12, 22, 12, 22));
        bar.putClientProperty("gbBg", "paper");
        Ui.themed(bar, t -> t.paper);

        JPanel left = new JPanel();
        left.setLayout(new BoxLayout(left, BoxLayout.X_AXIS));
        left.setOpaque(false);

        JLabel brand = Ui.inkBold(Config.APP_NAME, 20);
        brand.setFont(Ui.font(20, Font.BOLD));
        brand.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        brand.setToolTipText("回到首页（右键打开主站）");
        brand.addMouseListener(new MouseAdapter() {
            @Override public void mouseClicked(MouseEvent e) {
                if (SwingUtilities.isRightMouseButton(e)) Ui.browse(Config.MAIN_SITE);
                else showHome();
            }
        });
        JLabel dot = Ui.accent(".", 20);
        JLabel sub = Ui.muted(Config.APP_SUBTITLE, 11);

        left.add(brand);
        left.add(dot);
        left.add(Ui.hstrut(10));
        left.add(navHome = navLabel("首页", () -> showHome()));
        left.add(Ui.hstrut(4));
        left.add(navAbout = navLabel("关于", () -> showAbout()));
        left.add(Ui.hstrut(4));
        left.add(navContact = navLabel("联系", () -> showContact()));
        left.add(Ui.hstrut(12));
        left.add(sub);

        JPanel right = new JPanel();
        right.setLayout(new BoxLayout(right, BoxLayout.X_AXIS));
        right.setOpaque(false);

        writeBtn = Ui.primary("写稿");
        writeBtn.addActionListener(e -> showEditor());
        themeBtn = Ui.ghost(Theme.isDark() ? "亮色" : "暗色");
        themeBtn.setToolTipText("切换亮色 / 暗色主题");
        themeBtn.addActionListener(e -> Theme.toggle());
        loginBtn = Ui.ghost("登录");
        loginBtn.setToolTipText("GitHub 登录后可写稿、评论、点赞");
        loginBtn.addActionListener(e -> onLoginClicked());

        right.add(writeBtn);
        right.add(Ui.hstrut(8));
        right.add(loginBtn);
        right.add(Ui.hstrut(8));
        right.add(themeBtn);

        bar.add(left, BorderLayout.WEST);
        bar.add(right, BorderLayout.EAST);
    }

    private JLabel navLabel(String text, Runnable action) {
        JLabel l = Ui.ink2(text, 13);
        l.setBorder(BorderFactory.createEmptyBorder(4, 10, 4, 10));
        l.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        l.addMouseListener(new MouseAdapter() {
            @Override public void mouseClicked(MouseEvent e) { action.run(); }
            @Override public void mouseEntered(MouseEvent e) { l.setForeground(Theme.t().accent); }
            @Override public void mouseExited(MouseEvent e) { l.setForeground(Theme.t().ink2); }
        });
        return l;
    }

    /* ---------------- 页面路由 ---------------- */

    public void showHome() {
        cards.show(deck, "home");
        home.reload();
    }

    public void showDetail(int number) {
        cards.show(deck, "detail");
        detail.open(number);
    }

    public void showEditor() {
        if (!Session.loggedIn()) {
            toast("请先登录再写稿");
            onLoginClicked();
            return;
        }
        cards.show(deck, "editor");
        editor.reset();
    }

    public void showAbout() { cards.show(deck, "about"); }

    public void showContact() { cards.show(deck, "contact"); }

    /**
     * 供命令行 / 自动化验证使用：直接打开指定页面。
     * 用法：--page=home|about|contact|editor|detail --d=文章号
     */
    public void openPage(String page, int d) {
        if (page == null) return;
        switch (page.toLowerCase()) {
            case "about" -> showAbout();
            case "contact" -> showContact();
            case "editor" -> {
                cards.show(deck, "editor");
                editor.reset();
            }
            case "detail" -> {
                if (d > 0) showDetail(d); else showHome();
            }
            default -> showHome();
        }
    }

    /* ---------------- 启动数据 ---------------- */

    private void loadBootData() {
        Api.async(Api::categories, cats -> {
            MetaParser.setCats(cats);
            home.refreshCategories();
            editor.refreshCategories();
        }, e -> { /* 兜底分类继续可用 */ });

        Api.async(Api::announcements, list -> {
            List<String> titles = new ArrayList<>();
            for (Model.Announcement a : list) if (a.title() != null && !a.title().isBlank()) titles.add(a.title());
            ticker.setItems(titles);
        }, e -> ticker.setItems(List.of()));
    }

    /* ---------------- 登录 ---------------- */

    public void refreshLoginUi() {
        if (Session.loggedIn()) {
            loginBtn.setText(Session.user().name());
            loginBtn.setToolTipText("已登录 · 点击管理账号");
        } else {
            loginBtn.setText("登录");
            loginBtn.setToolTipText("GitHub 登录后可写稿、评论、点赞");
        }
        loginBtn.repaint();
    }

    private void onLoginClicked() {
        if (Session.loggedIn()) {
            JPopupMenu menu = themedMenu();
            JMenuItem who = new JMenuItem("当前账号：" + Session.user().name());
            who.setEnabled(false);
            JMenuItem site = new JMenuItem("打开主站");
            site.addActionListener(e -> Ui.browse(Config.MAIN_SITE));
            JMenuItem out = new JMenuItem("退出登录");
            out.addActionListener(e -> Session.logout(() -> {
                refreshLoginUi();
                toast("已退出登录");
            }));
            menu.add(who);
            menu.addSeparator();
            menu.add(site);
            menu.add(out);
            menu.show(loginBtn, 0, loginBtn.getHeight() + 4);
            return;
        }

        JPopupMenu menu = themedMenu();
        JMenuItem device = new JMenuItem("GitHub 设备码登录（推荐）");
        device.addActionListener(e -> startDeviceLogin());
        JMenuItem browser = new JMenuItem("浏览器登录后粘贴令牌");
        browser.addActionListener(e -> {
            Session.openBrowserLogin();
            pasteTokenDialog("浏览器里完成 GitHub 授权后，从站点 Cookie 或 GitHub 设置里取得令牌，粘贴到下面。");
        });
        JMenuItem manual = new JMenuItem("手动粘贴令牌（PAT）");
        manual.addActionListener(e -> pasteTokenDialog(
                "在 GitHub → Settings → Developer settings → Personal access tokens 生成经典令牌，勾选 public_repo，粘贴到下面。"));
        menu.add(device);
        menu.addSeparator();
        menu.add(browser);
        menu.add(manual);
        menu.show(loginBtn, 0, loginBtn.getHeight() + 4);
    }

    private JPopupMenu themedMenu() {
        JPopupMenu m = new JPopupMenu();
        m.setBorder(BorderFactory.createLineBorder(Theme.t().line2));
        m.setBackground(Theme.t().paper);
        return m;
    }

    /** 设备码登录：先弹一个非模态小窗展示 user_code，轮询在后台完成。 */
    private void startDeviceLogin() {
        JDialog dlg = new JDialog(this, "GitHub 设备码登录", false);
        JPanel box = new JPanel();
        box.setLayout(new BoxLayout(box, BoxLayout.Y_AXIS));
        box.setBackground(Theme.t().paper);
        box.setBorder(BorderFactory.createEmptyBorder(18, 22, 18, 22));

        JLabel step = Ui.ink2("1. 复制下面的验证码　2. 在打开的页面里输入并授权", 13);
        JLabel code = Ui.inkBold("……", 26);
        code.setFont(Ui.font(26, Font.BOLD));
        JLabel state = Ui.muted("正在申请设备码…", 12);

        JButton open = Ui.primary("打开 GitHub 验证页");
        JButton copy = Ui.ghost("复制验证码");
        JButton cancel = Ui.ghost("取消");
        JPanel actions = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        actions.setOpaque(false);
        actions.add(open);
        actions.add(copy);
        actions.add(cancel);

        for (Component c : new Component[]{step, code, state, actions}) {
            if (c instanceof JComponent jc) jc.setAlignmentX(Component.LEFT_ALIGNMENT);
            box.add(c);
            box.add(Box.createVerticalStrut(10));
        }
        dlg.setContentPane(box);
        dlg.pack();
        dlg.setLocationRelativeTo(this);
        dlg.setVisible(true);

        final String[] uriHolder = {"https://github.com/login/device"};
        open.addActionListener(e -> Ui.browse(uriHolder[0]));
        cancel.addActionListener(e -> dlg.dispose());

        Session.deviceLogin(dc -> {
            code.setText(dc.userCode);
            uriHolder[0] = dc.verificationUri;
            state.setText("等待授权中…（可点「打开 GitHub 验证页」）");
            copy.addActionListener(e -> {
                Toolkit.getDefaultToolkit().getSystemClipboard()
                        .setContents(new java.awt.datatransfer.StringSelection(dc.userCode), null);
                toast("验证码已复制");
            });
            Ui.browse(dc.verificationUri);
        }, me -> {
            dlg.dispose();
            refreshLoginUi();
            toast("登录成功：" + me.name());
        }, err -> {
            dlg.dispose();
            String msg = err.getMessage() == null ? "登录失败" : err.getMessage();
            if (msg.contains("device") || msg.contains("not enabled") || msg.contains("无法从")) {
                boolean go = Ui.confirm(this, "设备码登录不可用",
                        msg + "\n\n是否改用「手动粘贴令牌」？");
                if (go) pasteTokenDialog("粘贴 GitHub 令牌（需勾选 public_repo）。");
            } else {
                Ui.alert(this, "登录失败", msg);
            }
        });
    }

    private void pasteTokenDialog(String hint) {
        String t = Ui.prompt(this, "登录 · 粘贴令牌", hint + "\n\n令牌（只保存在本机用户目录）", "");
        if (t == null || t.isBlank()) return;
        toast("正在校验令牌…");
        Session.applyToken(t.trim(), me -> {
            refreshLoginUi();
            toast("登录成功：" + me.name());
        }, err -> Ui.alert(this, "登录失败", err.getMessage() == null ? "令牌无效" : err.getMessage()));
    }

    /* ---------------- 主题 ---------------- */

    private void onThemeChanged() {
        themeBtn.setText(Theme.isDark() ? "亮色" : "暗色");
        Ui.refreshTheme();
        Ui.retint(getContentPane());
        bar.setBackground(Theme.t().paper);
        deck.setBackground(Theme.t().bg);
        getContentPane().setBackground(Theme.t().bg);
        ticker.repaint();
        repaint();
        SwingUtilities.updateComponentTreeUI(this);
        Ui.refreshTheme();
        Ui.retint(getContentPane());
        revalidate();
        repaint();
    }

    /* ---------------- 轻提示（玻璃窗格，不阻塞交互） ---------------- */

    private void installToast() {
        JComponent glass = new JComponent() {
            @Override public boolean contains(int x, int y) { return false; }

            @Override protected void paintComponent(Graphics g) {
                if (toastMsg == null) return;
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setFont(Ui.font(13, Font.BOLD));
                FontMetrics fm = g2.getFontMetrics();
                int pad = 16;
                int w = fm.stringWidth(toastMsg) + pad * 2;
                int h = 40;
                int x = (getWidth() - w) / 2;
                int y = getHeight() - 90;
                g2.setColor(new Color(0, 0, 0, 200));
                g2.fillRoundRect(x, y, w, h, h, h);
                g2.setColor(Color.WHITE);
                g2.drawString(toastMsg, x + pad, y + (h + fm.getAscent() - fm.getDescent()) / 2);
                g2.dispose();
            }
        };
        glass.setOpaque(false);
        setGlassPane(glass);
        glass.setVisible(true);
    }

    public void toast(String msg) {
        toastMsg = msg;
        getGlassPane().repaint();
        if (toastTimer != null) toastTimer.stop();
        toastTimer = new Timer(2600, e -> {
            toastMsg = null;
            getGlassPane().repaint();
        });
        toastTimer.setRepeats(false);
        toastTimer.start();
    }

    /* ---------------- 公告条 ---------------- */

    private final class TickerBar extends JComponent {
        private final List<String> items = new ArrayList<>();
        private final Timer anim;
        private int index = 0;

        TickerBar() {
            setPreferredSize(new Dimension(10, 34));
            anim = new Timer(5200, e -> {
                if (items.size() <= 1) return;
                index = (index + 1) % items.size();
                repaint();
            });
            setVisible(false);
        }

        void setItems(List<String> list) {
            items.clear();
            if (list != null) items.addAll(list);
            index = 0;
            setVisible(!items.isEmpty());
            if (items.size() > 1) anim.start(); else anim.stop();
            revalidate();
            repaint();
        }

        @Override protected void paintComponent(Graphics g) {
            if (items.isEmpty()) return;
            Theme.Tokens t = Theme.t();
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g2.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            g2.setColor(t.paper2);
            g2.fillRect(0, 0, getWidth(), getHeight());

            g2.setColor(t.accent);
            g2.fillOval(22, getHeight() / 2 - 4, 8, 8);
            g2.setFont(Ui.font(12, Font.BOLD));
            g2.drawString("公告", 38, getHeight() / 2 + 4);

            g2.setColor(t.line2);
            g2.drawLine(74, 9, 74, getHeight() - 9);

            String text = items.get(index);
            g2.setFont(Ui.fontFor(text, 12, Font.PLAIN));
            g2.setColor(t.ink2);
            FontMetrics fm = g2.getFontMetrics();
            String draw = text;
            int maxW = getWidth() - 96;
            while (fm.stringWidth(draw) > maxW && draw.length() > 4) {
                draw = draw.substring(0, draw.length() - 2) + "…";
            }
            g2.drawString(draw, 88, getHeight() / 2 + fm.getAscent() / 2 - 1);
            if (items.size() > 1) {
                g2.setFont(Ui.font(11));
                g2.setColor(t.muted);
                g2.drawString((index + 1) + "/" + items.size(), getWidth() - 46, getHeight() / 2 + 4);
            }
            g2.dispose();
        }
    }
}
