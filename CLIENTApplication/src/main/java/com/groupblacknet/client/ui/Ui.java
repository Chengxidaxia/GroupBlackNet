package com.groupblacknet.client.ui;

import com.groupblacknet.client.core.*;

import java.awt.*;
import java.awt.event.*;
import java.awt.geom.Ellipse2D;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.net.URI;
import java.util.function.Consumer;
import java.util.function.Supplier;

import javax.swing.*;
import javax.swing.border.EmptyBorder;

/**
 * 通用 UI 组件与工具：圆角卡片、按钮、chip、封面视图、头像、加载动画、轻提示、主题化弹窗。
 * 全部按 Theme 的 token 绘制，主题切换后刷新即可。
 */
public final class Ui {

    private Ui() {}

    /* ---------------- 字体 ---------------- */

    public static final String SANS = "Microsoft YaHei";
    public static final String SERIF = "Microsoft YaHei";
    public static final String EMOJI = "Segoe UI Emoji";

    public static Font font(int size) { return new Font(SANS, Font.PLAIN, size); }
    public static Font font(int size, int style) { return new Font(SANS, style, size); }

    /** 含 emoji 的文本用 emoji 字体，避免显示成方框。 */
    public static Font fontFor(String s, int size, int style) {
        return new Font(hasEmoji(s) ? EMOJI : SANS, style, size);
    }

    public static boolean hasEmoji(String s) {
        if (s == null) return false;
        for (int i = 0; i < s.length(); ) {
            int cp = s.codePointAt(i);
            if (isEmojiCp(cp)) return true;
            i += Character.charCount(cp);
        }
        return false;
    }

    public static boolean hasCjk(String s) {
        if (s == null) return false;
        for (int i = 0; i < s.length(); ) {
            int cp = s.codePointAt(i);
            if ((cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF)
                    || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0x3000 && cp <= 0x303F)
                    || (cp >= 0xFF00 && cp <= 0xFFEF)) return true;
            i += Character.charCount(cp);
        }
        return false;
    }

    private static boolean isEmojiCp(int cp) {
        if (cp >= 0x1F000) return true;                                        // 补充平面（🔥💬🚀🌙…）
        return cp >= 0x2190 && cp <= 0x2BFF && Character.getType(cp) == Character.OTHER_SYMBOL;
    }

    /**
     * 混排文本的关键：**逐段指定字体**。
     * 整串换成 emoji 字体会让中文变方框（Segoe UI Emoji 没有 CJK 字形），
     * 所以这里把 emoji 段单独包 `<font face>`，其余仍用组件自身字体（雅黑，字号继承）。
     */

    /* ---------------- 轻提示（替代 JOptionPane 的打扰式弹窗） ---------------- */

    private static Consumer<String> toastHook = msg -> System.out.println("[toast] " + msg);

    public static void setToastHook(Consumer<String> hook) {
        if (hook != null) toastHook = hook;
    }

    public static void toast(String msg) { toastHook.accept(msg); }

    /* ---------------- 圆角容器 ---------------- */

    public static JPanel rounded(Color bg, int radius) {
        JPanel p = new JPanel() {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(bg);
                g2.fillRoundRect(0, 0, getWidth() - 1, getHeight() - 1, radius * 2, radius * 2);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        p.setOpaque(false);
        return p;
    }

    /** 卡片：纸面底色 + 细边框 + 圆角。 */
    public static JPanel card() {
        Theme.Tokens t = Theme.t();
        JPanel p = new JPanel() {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                Theme.Tokens tk = Theme.t();
                g2.setColor(tk.paper);
                g2.fillRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 32, 32);
                g2.setColor(tk.line);
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 32, 32);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        p.setOpaque(false);
        p.setLayout(new BorderLayout());
        return p;
    }

    /** 细线分隔（水平）。 */
    public static JComponent hline() {
        JPanel p = new JPanel();
        p.setPreferredSize(new Dimension(1, 1));
        p.setBackground(Theme.t().line);
        return p;
    }

    /* ---------------- 按钮 ---------------- */

    public static JButton primary(String text) {
        return button(text, true);
    }

    public static JButton ghost(String text) {
        return button(text, false);
    }

    private static JButton button(String text, boolean primary) {
        JButton b = new JButton(text) {
            private boolean hover = false;
            {
                addMouseListener(new MouseAdapter() {
                    @Override public void mouseEntered(MouseEvent e) { hover = true; repaint(); }
                    @Override public void mouseExited(MouseEvent e) { hover = false; repaint(); }
                });
            }
            /**
             * 按钮文字里的 emoji（如表情反应「👍 3」）：
             * 整串不含中文时直接用 emoji 字体；含中文则退回雅黑（按钮里不适合放 HTML，会换行）。
             */
            @Override public void setText(String t) {
                String v = t == null ? "" : t;
                super.setText(v);
                setFont(hasEmoji(v) && !hasCjk(v) ? new Font(EMOJI, Font.BOLD, 13) : font(13, Font.BOLD));
            }
            @Override protected void paintComponent(Graphics g) {
                Theme.Tokens t = Theme.t();
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                Color bg = primary
                        ? (hover ? t.accent.brighter() : t.accent)
                        : (hover ? t.paper2 : t.paper);
                if (!isEnabled()) bg = t.line2;
                g2.setColor(bg);
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 18, 18);
                if (!primary) {
                    g2.setColor(t.line2);
                    g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 18, 18);
                }
                g2.dispose();
                super.paintComponent(g);
            }
        };
        b.setFont(font(13, Font.BOLD));
        themedFg(b, t -> primary ? t.onAccent : t.ink2);
        b.setContentAreaFilled(false);
        b.setBorderPainted(false);
        b.setFocusPainted(false);
        b.setOpaque(false);
        b.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        b.setBorder(new EmptyBorder(8, 16, 8, 16));
        return b;
    }

    /** 分类标签（chip）。 */
    public static JLabel chip(String text, Color bg) {
        JLabel l = new JLabel(" " + text + " ") {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), getHeight(), getHeight());
                g2.dispose();
                super.paintComponent(g);
            }
        };
        l.setOpaque(false);
        l.setBackground(bg);
        l.setForeground(Color.WHITE);
        l.setFont(font(11, Font.BOLD));
        l.setBorder(new EmptyBorder(3, 9, 3, 9));
        return l;
    }

    public static JLabel text(String s, int size, Color color) {
        return label(s, size, Font.PLAIN, color);
    }

    /**
     * 统一标签工厂。
     * 字体规则（**不要在同一串里混排中文与 emoji**）：
     *   · 含 emoji 且不含中文 → 整串用 Segoe UI Emoji（如「👍 3」）
     *   · 其余 → 雅黑
     * 混排场景请用 Ui.hbox() 把 emoji 标签与中文标签并排（见 Ui.emojiMuted/emojiInk2）：
     * 整串换 emoji 字体会让中文变方框，而 Swing 的 HTML 标签又会因量宽误差把末字挤到第二行。
     */
    private static JLabel label(String s, int size, int style, Color color) {
        String v = s == null ? "" : s;
        JLabel l = new JLabel(v);
        l.setFont(hasEmoji(v) && !hasCjk(v) ? new Font(EMOJI, style, size) : font(size, style));
        l.setForeground(color);
        return l;
    }

    /** 独立 emoji 标签（灰）—— 与中文文本并排时使用，避免混排方框。 */
    public static JLabel emojiMuted(String e, int size) {
        return themedFg(labelEmoji(e, size), t -> t.muted);
    }

    /** 独立 emoji 标签（次级文字色）。 */
    public static JLabel emojiInk2(String e, int size) {
        return themedFg(labelEmoji(e, size), t -> t.ink2);
    }

    /** 独立 emoji 标签（强调色，用于「热门榜」这类标题前的小图标）。 */
    public static JLabel emojiAccent(String e, int size) {
        return themedFg(labelEmoji(e, size), t -> t.accent);
    }

    private static JLabel labelEmoji(String e, int size) {
        JLabel l = new JLabel(e == null ? "" : e);
        l.setFont(new Font(EMOJI, Font.PLAIN, size));
        l.setForeground(Theme.t().muted);
        return l;
    }

    public static JLabel ink(String s, int size) { return themedFg(label(s, size, Font.PLAIN, Theme.t().ink), t -> t.ink); }

    public static JLabel ink2(String s, int size) { return themedFg(label(s, size, Font.PLAIN, Theme.t().ink2), t -> t.ink2); }

    public static JLabel muted(String s, int size) { return themedFg(label(s, size, Font.PLAIN, Theme.t().muted), t -> t.muted); }

    public static JLabel accent(String s, int size) { return themedFg(label(s, size, Font.PLAIN, Theme.t().accent), t -> t.accent); }

    public static JLabel inkBold(String s, int size) {
        return themedFg(label(s, size, Font.BOLD, Theme.t().ink), t -> t.ink);
    }

    public static JLabel mutedBold(String s, int size) {
        return themedFg(label(s, size, Font.BOLD, Theme.t().muted), t -> t.muted);
    }

    public static JLabel bold(String s, int size, Color color) {
        JLabel l = new JLabel(s);
        l.setFont(font(size, Font.BOLD));
        l.setForeground(color);
        return l;
    }

    /** 可点击链接（系统浏览器打开）。 */
    public static JLabel link(String text, String url) {
        JLabel l = text(text, 13, Theme.t().accent);
        l.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        l.addMouseListener(new MouseAdapter() {
            @Override public void mouseClicked(MouseEvent e) { browse(url); }
        });
        return l;
    }

    public static void browse(String url) {
        if (url == null || url.isBlank()) return;
        try { Desktop.getDesktop().browse(URI.create(url)); }
        catch (Exception e) {
            try { new ProcessBuilder("cmd", "/c", "start", "", url).start(); }
            catch (Exception ignore) { toast("无法打开浏览器：" + url); }
        }
    }

    /* ---------------- 滚动容器 ---------------- */

    public static JScrollPane scroll(Component view) {
        JScrollPane sp = new JScrollPane(view);
        sp.setBorder(null);
        sp.getViewport().setOpaque(true);
        sp.getViewport().setBackground(Theme.t().bg);
        sp.setOpaque(true);
        sp.setBackground(Theme.t().bg);
        sp.getVerticalScrollBar().setUnitIncrement(18);
        sp.getVerticalScrollBar().setPreferredSize(new Dimension(10, 0));
        sp.getHorizontalScrollBar().setPreferredSize(new Dimension(0, 10));
        return sp;
    }

    /** 深度重着色：滚动容器 / 文本组件 / 下拉框 / 标记过的面板（主题切换时调用）。 */
    public static void retint(Component c) {
        Theme.Tokens t = Theme.t();
        if (c instanceof JScrollPane sp) {
            sp.setBorder(null);
            sp.setBackground(t.bg);
            sp.getViewport().setBackground(t.bg);
        } else if (c instanceof javax.swing.text.JTextComponent tc) {
            tc.setBackground(t.bg);
            tc.setForeground(t.ink);
            tc.setCaretColor(t.ink);
            tc.setSelectionColor(t.accentSoft);
            tc.setSelectedTextColor(t.ink);
        } else if (c instanceof JComboBox<?> cb) {
            cb.setBackground(t.paper);
            cb.setForeground(t.ink);
        } else if (c instanceof JPanel p) {
            Object tag = p.getClientProperty("gbBg");
            if ("bg".equals(tag)) p.setBackground(t.bg);
            else if ("paper".equals(tag)) p.setBackground(t.paper);
        }
        if (c instanceof Container ct) {
            for (Component ch : ct.getComponents()) retint(ch);
        }
    }

    /**
     * 简单竖直布局：子组件按各自首选高度排列，宽度铺满容器。
     * 比 BoxLayout 更可预测（不会出现宽度溢出或高度被动拉伸）。
     */
    public static final class VerticalLayout implements LayoutManager {
        private final int gap;

        public VerticalLayout() { this(0); }

        public VerticalLayout(int gap) { this.gap = gap; }

        @Override public void addLayoutComponent(String name, Component comp) { }

        @Override public void removeLayoutComponent(Component comp) { }

        @Override public Dimension preferredLayoutSize(Container parent) {
            int w = 0, h = 0, n = 0;
            for (Component c : parent.getComponents()) {
                if (!c.isVisible()) continue;
                Dimension d = c.getPreferredSize();
                w = Math.max(w, d.width);
                h += d.height;
                n++;
            }
            if (n > 1) h += gap * (n - 1);
            Insets in = parent.getInsets();
            return new Dimension(w + in.left + in.right, h + in.top + in.bottom);
        }

        @Override public Dimension minimumLayoutSize(Container parent) {
            return preferredLayoutSize(parent);
        }

        @Override public void layoutContainer(Container parent) {
            Insets in = parent.getInsets();
            int x = in.left;
            int width = Math.max(0, parent.getWidth() - in.left - in.right);
            int y = in.top;
            boolean first = true;
            for (Component c : parent.getComponents()) {
                if (!c.isVisible()) continue;
                if (!first) y += gap;
                first = false;
                Dimension d = c.getPreferredSize();
                int h = Math.max(0, d.height);
                c.setBounds(x, y, width, h);
                y += h;
            }
        }
    }

    /**
     * 单行横向布局：按首选宽度依次排列，**不折行**（超出部分由容器裁切）。
     * 用于卡片脚注这类「宁可裁掉也不换行」的信息行。
     */
    public static final class HorizontalLayout implements LayoutManager {
        private final int gap;

        public HorizontalLayout() { this(6); }

        public HorizontalLayout(int gap) { this.gap = gap; }

        @Override public void addLayoutComponent(String name, Component comp) { }

        @Override public void removeLayoutComponent(Component comp) { }

        @Override public Dimension preferredLayoutSize(Container parent) {
            int w = 0, h = 0, n = 0;
            for (Component c : parent.getComponents()) {
                if (!c.isVisible()) continue;
                Dimension d = c.getPreferredSize();
                w += d.width;
                h = Math.max(h, d.height);
                n++;
            }
            if (n > 1) w += gap * (n - 1);
            Insets in = parent.getInsets();
            return new Dimension(w + in.left + in.right, h + in.top + in.bottom);
        }

        @Override public Dimension minimumLayoutSize(Container parent) { return preferredLayoutSize(parent); }

        @Override public void layoutContainer(Container parent) {
            Insets in = parent.getInsets();
            int x = in.left, h = parent.getHeight() - in.top - in.bottom;
            for (Component c : parent.getComponents()) {
                if (!c.isVisible()) continue;
                Dimension d = c.getPreferredSize();
                int y = in.top + Math.max(0, (h - d.height) / 2);
                c.setBounds(x, y, d.width, d.height);     // 不做换行；超出由父容器裁切
                x += d.width + gap;
            }
        }
    }

    /** 单行横向容器（透明，不折行）。 */
    public static JPanel hbox() {
        JPanel p = new JPanel(new HorizontalLayout());
        p.setOpaque(false);
        return p;
    }

    /** 竖直容器：子组件宽度铺满、高度按首选。 */
    public static JPanel vbox() {
        JPanel p = new JPanel(new VerticalLayout());
        p.setOpaque(true);
        p.putClientProperty("gbBg", "bg");
        p.setBackground(Theme.t().bg);
        return p;
    }

    /** 透明竖直容器（嵌在卡片里用）。 */
    public static JPanel vboxClear() {
        JPanel p = new JPanel(new VerticalLayout());
        p.setOpaque(false);
        return p;
    }

    /** 竖直堆叠容器（背景跟随主题）。 */
    public static JPanel column() {
        JPanel p = new JPanel();
        p.setLayout(new BoxLayout(p, BoxLayout.Y_AXIS));
        p.setOpaque(true);
        p.putClientProperty("gbBg", "bg");
        p.setBackground(Theme.t().bg);
        return p;
    }

    /**
     * 可滚动内容的竖直列：宽度始终跟随视口（不产生横向滚动条）。
     */
    public static JPanel scrollColumn() {
        return new ScrollColumn();
    }

    private static final class ScrollColumn extends JPanel implements Scrollable {
        ScrollColumn() {
            super(new VerticalLayout());
            setOpaque(true);
            putClientProperty("gbBg", "bg");
            setBackground(Theme.t().bg);
        }

        @Override public Dimension getPreferredScrollableViewportSize() { return getPreferredSize(); }

        @Override public int getScrollableUnitIncrement(Rectangle visibleRect, int orientation, int direction) {
            return 18;
        }

        @Override public int getScrollableBlockIncrement(Rectangle visibleRect, int orientation, int direction) {
            return Math.max(40, visibleRect.height - 40);
        }

        @Override public boolean getScrollableTracksViewportWidth() { return true; }

        @Override public boolean getScrollableTracksViewportHeight() { return false; }
    }

    /** 让组件在竖直列里按可用宽度拉伸。 */
    public static <C extends JComponent> C stretch(C c) {
        Dimension m = c.getMaximumSize();
        c.setAlignmentX(Component.CENTER_ALIGNMENT);
        c.setMaximumSize(new Dimension(Integer.MAX_VALUE, m.height));
        return c;
    }

    public static JPanel row() {
        JPanel p = new JPanel();
        p.setLayout(new BoxLayout(p, BoxLayout.X_AXIS));
        p.setOpaque(false);
        return p;
    }

    /* ---------------- 加载动画 ---------------- */

    public static JComponent spinner(String label) {
        JPanel box = new JPanel();
        box.setLayout(new BoxLayout(box, BoxLayout.Y_AXIS));
        box.setOpaque(true);
        box.setBackground(Theme.t().bg);
        box.setBorder(new EmptyBorder(40, 0, 40, 0));

        JComponent ring = new JComponent() {
            private final Timer timer;
            private float angle = 0;
            {
                setPreferredSize(new Dimension(30, 30));
                setMaximumSize(new Dimension(30, 30));
                setAlignmentX(Component.CENTER_ALIGNMENT);
                timer = new Timer(16, e -> { angle = (angle + 5) % 360; repaint(); });
                timer.start();
            }
            @Override public void removeNotify() { timer.stop(); super.removeNotify(); }
            @Override public void addNotify() { timer.start(); super.addNotify(); }
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                Theme.Tokens t = Theme.t();
                g2.setStroke(new BasicStroke(3f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
                g2.setColor(t.line2);
                g2.drawArc(2, 2, getWidth() - 5, getHeight() - 5, 0, 360);
                g2.setColor(t.accent);
                g2.drawArc(2, 2, getWidth() - 5, getHeight() - 5, (int) angle, 90);
                g2.dispose();
            }
        };
        JLabel l = muted(label == null ? "加载中…" : label, 13);
        l.setAlignmentX(Component.CENTER_ALIGNMENT);
        box.add(ring);
        box.add(Box.createVerticalStrut(10));
        box.add(l);
        return box;
    }

    public static JComponent emptyNote(String msg) {
        JPanel p = new JPanel(new GridBagLayout());
        p.setOpaque(true);
        p.setBackground(Theme.t().bg);
        p.setBorder(new EmptyBorder(36, 0, 36, 0));
        JLabel l = muted(msg, 13);
        p.add(l);
        return p;
    }

    /* ---------------- 封面视图 ---------------- */

    /**
     * 封面：完全对齐站点的 coverHTML 裁定规则。
     *   tpl=true / 无 tpl 键但有分类 → 分类模板渐变
     *   tpl=false / 无分类 → 图标（失败→渐变）> coverText > 渐变
     */
    public static final class CoverView extends JComponent {
        private final Model.Meta meta;
        private final int catId;
        private final int radius;
        private final int textSize;
        private BufferedImage image;
        private boolean imageReady, imageFailed, loadStarted;

        public CoverView(Model.Meta meta, int catId, int radius, int textSize) {
            this.meta = meta == null ? Model.Meta.empty("") : meta;
            this.catId = catId;
            this.radius = radius;
            this.textSize = textSize;
            setOpaque(false);
        }

        /** 首次真正绘制（拿到真实尺寸）后才去下载，避免缓存成 1×1 的模糊图。 */
        private void maybeLoad() {
            if (loadStarted) return;
            if (MetaParser.useTemplateCover(meta, catId)) { loadStarted = true; return; }
            if (meta.icon() == null || meta.icon().isBlank()) { loadStarted = true; return; }
            int w = getWidth(), h = getHeight();
            if (w < 8 || h < 8) return;      // 还没布局完，等下一次绘制再试
            loadStarted = true;
            ImgCache.load(meta.icon(), w, h, true,
                    img -> { image = (BufferedImage) img; imageReady = true; repaint(); },
                    () -> { imageFailed = true; repaint(); });
        }

        private Color c1() { return Theme.hueColor(MetaParser.catInfo(catId).hue(), 0.62f, 0.58f); }
        private Color c2() { return Theme.hueColor(MetaParser.catInfo(catId).hue() + 28, 0.66f, 0.40f); }

        @Override protected void paintComponent(Graphics g) {
            maybeLoad();
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g2.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            Shape clip = radius > 0
                    ? new RoundRectangle2D.Float(0, 0, getWidth(), getHeight(), radius * 2f, radius * 2f)
                    : new Rectangle(0, 0, getWidth(), getHeight());
            g2.clip(clip);

            boolean tpl = MetaParser.useTemplateCover(meta, catId);
            boolean hasIcon = !tpl && meta.icon() != null && !meta.icon().isBlank() && !imageFailed;

            // 渐变底（始终铺，作为图片失败时的兜底）
            g2.setPaint(new GradientPaint(0, 0, c1(), getWidth(), getHeight(), c2()));
            g2.fillRect(0, 0, getWidth(), getHeight());

            if (hasIcon && imageReady && image != null) {
                g2.drawImage(image, 0, 0, getWidth(), getHeight(), null);
            } else if (!tpl && !hasIcon && meta.coverText() != null && !meta.coverText().isBlank()) {
                drawCentered(g2, meta.coverText(), Math.round(textSize * 0.7f));
            } else {
                drawCentered(g2, MetaParser.coverLabel(catId), textSize);
            }
            g2.dispose();
        }

        private void drawCentered(Graphics2D g2, String s, int size) {
            if (s == null || s.isBlank()) return;
            g2.setFont(font(Math.max(10, size), Font.BOLD));
            g2.setColor(new Color(255, 255, 255, 240));
            FontMetrics fm = g2.getFontMetrics();
            int maxW = Math.max(10, getWidth() - 20);
            java.util.List<String> lines = wrap(s, fm, maxW);
            int lh = fm.getHeight();
            int y = (getHeight() - lines.size() * lh) / 2 + fm.getAscent();
            for (String line : lines) {
                int x = (getWidth() - fm.stringWidth(line)) / 2;
                g2.drawString(line, x, y);
                y += lh;
            }
        }

        private static java.util.List<String> wrap(String s, FontMetrics fm, int maxW) {
            java.util.List<String> out = new java.util.ArrayList<>();
            StringBuilder cur = new StringBuilder();
            for (char c : s.toCharArray()) {
                if (fm.stringWidth(cur.toString() + c) > maxW && cur.length() > 0) {
                    out.add(cur.toString());
                    cur.setLength(0);
                }
                cur.append(c);
            }
            if (cur.length() > 0) out.add(cur.toString());
            return out.stream().limit(3).toList();
        }
    }

    /* ---------------- 头像 ---------------- */

    public static final class AvatarView extends JComponent {
        private final Model.Author author;
        private final int size;
        private BufferedImage img;

        public AvatarView(Model.Author a, int size) {
            this.author = a == null ? new Model.Author("匿名", null) : a;
            this.size = size;
            setPreferredSize(new Dimension(size, size));
            setMinimumSize(new Dimension(size, size));
            setMaximumSize(new Dimension(size, size));
            setOpaque(false);
            String url = author.avatarUrl();
            if (url != null && !url.isBlank()) {
                ImgCache.load(url, size, size, false,
                        image -> { img = (BufferedImage) ImgCache.circular(image, size); repaint(); },
                        () -> { });
            }
        }

        @Override protected void paintComponent(Graphics g) {
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g2.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            if (img != null) {
                g2.drawImage(img, 0, 0, size, size, null);
            } else {
                Theme.Tokens t = Theme.t();
                g2.setColor(t.paper2);
                g2.fill(new Ellipse2D.Float(0, 0, size, size));
                g2.setColor(t.muted);
                g2.setFont(font(Math.max(10, size / 2), Font.BOLD));
                FontMetrics fm = g2.getFontMetrics();
                String s = author.initial();
                g2.drawString(s, (size - fm.stringWidth(s)) / 2, (size + fm.getAscent() - fm.getDescent()) / 2);
            }
            g2.dispose();
        }
    }

    /* ---------------- 主题化弹窗（不用 JOptionPane / alert） ---------------- */

    public static String prompt(Component parent, String title, String label, String initial) {
        JTextField field = new JTextField(initial == null ? "" : initial, 28);
        field.setFont(font(13));
        field.setBackground(Theme.t().bg);
        field.setForeground(Theme.t().ink);
        field.setCaretColor(Theme.t().ink);
        field.setBorder(BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(Theme.t().line2),
                new EmptyBorder(6, 8, 6, 8)));

        JPanel body = new JPanel();
        body.setLayout(new BoxLayout(body, BoxLayout.Y_AXIS));
        body.setBackground(Theme.t().paper);
        JLabel l = text(label, 13, Theme.t().ink2);
        l.setAlignmentX(Component.LEFT_ALIGNMENT);
        body.add(l);
        body.add(Box.createVerticalStrut(8));
        field.setAlignmentX(Component.LEFT_ALIGNMENT);
        body.add(field);
        return showDialog(parent, title, body, field, "确定", "取消") ? field.getText() : null;
    }

    public static boolean confirm(Component parent, String title, String message) {
        JPanel body = new JPanel();
        body.setLayout(new BoxLayout(body, BoxLayout.Y_AXIS));
        body.setBackground(Theme.t().paper);
        body.add(text(message, 13, Theme.t().ink2));
        return showDialog(parent, title, body, null, "确定", "取消");
    }

    public static void alert(Component parent, String title, String message) {
        JPanel body = new JPanel();
        body.setLayout(new BoxLayout(body, BoxLayout.Y_AXIS));
        body.setBackground(Theme.t().paper);
        JLabel lbl = text("<html><body style='width:320px'>" + Markdown.esc(message) + "</body></html>", 13, Theme.t().ink2);
        body.add(lbl);
        showDialog(parent, title, body, null, "知道了", null);
    }

    private static boolean showDialog(Component parent, String title, JComponent body,
                                      JTextField focus, String okText, String cancelText) {
        Window owner = parent == null ? null : SwingUtilities.getWindowAncestor(parent);
        JDialog dlg = owner instanceof Frame f ? new JDialog(f, title, true)
                : new JDialog((Frame) null, title, true);
        Theme.Tokens t = Theme.t();
        JPanel root = new JPanel(new BorderLayout());
        root.setBackground(t.paper);
        root.setBorder(new EmptyBorder(18, 20, 16, 20));
        JLabel head = bold(title, 15, t.ink);
        root.add(head, BorderLayout.NORTH);
        body.setBorder(new EmptyBorder(12, 0, 14, 0));
        root.add(body, BorderLayout.CENTER);

        final boolean[] ok = {false};
        JPanel actions = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        actions.setOpaque(false);
        JButton cancel = ghost(cancelText == null ? "关闭" : cancelText);
        cancel.addActionListener(e -> dlg.dispose());
        actions.add(cancel);
        if (cancelText != null) {
            JButton okBtn = primary(okText);
            okBtn.addActionListener(e -> { ok[0] = true; dlg.dispose(); });
            actions.add(okBtn);
            dlg.getRootPane().setDefaultButton(okBtn);
        }
        root.add(actions, BorderLayout.SOUTH);

        dlg.setContentPane(root);
        dlg.pack();
        dlg.setLocationRelativeTo(owner);
        if (focus != null) SwingUtilities.invokeLater(focus::requestFocusInWindow);
        dlg.setVisible(true);
        return ok[0];
    }

    /* ---------------- 主题联动的背景登记 ---------------- */

    private static final java.util.List<Object[]> THEMED = new java.util.ArrayList<>();
    private static final java.util.List<Object[]> THEMED_FG = new java.util.ArrayList<>();

    /** 登记一个「背景跟随主题」的组件；主题切换时由 refreshTheme() 统一刷新。 */
    public static <C extends JComponent> C themed(C c, java.util.function.Function<Theme.Tokens, Color> pick) {
        THEMED.add(new Object[]{ new java.lang.ref.WeakReference<>(c), pick });
        c.setOpaque(true);
        c.setBackground(pick.apply(Theme.t()));
        return c;
    }

    /** 登记一个「前景色跟随主题」的组件。 */
    public static <C extends JComponent> C themedFg(C c, java.util.function.Function<Theme.Tokens, Color> pick) {
        THEMED_FG.add(new Object[]{ new java.lang.ref.WeakReference<>(c), pick });
        c.setForeground(pick.apply(Theme.t()));
        return c;
    }

    public static void refreshTheme() {
        THEMED.removeIf(entry -> {
            JComponent c = (JComponent) ((java.lang.ref.WeakReference<?>) entry[0]).get();
            if (c == null) return true;
            @SuppressWarnings("unchecked")
            java.util.function.Function<Theme.Tokens, Color> pick =
                    (java.util.function.Function<Theme.Tokens, Color>) entry[1];
            c.setBackground(pick.apply(Theme.t()));
            c.repaint();
            return false;
        });
        THEMED_FG.removeIf(entry -> {
            JComponent c = (JComponent) ((java.lang.ref.WeakReference<?>) entry[0]).get();
            if (c == null) return true;
            @SuppressWarnings("unchecked")
            java.util.function.Function<Theme.Tokens, Color> pick =
                    (java.util.function.Function<Theme.Tokens, Color>) entry[1];
            c.setForeground(pick.apply(Theme.t()));
            c.repaint();
            return false;
        });
    }

    /* ---------------- 小工具 ---------------- */

    public static JLabel grow() { return new JLabel(); }

    public static Component hstrut(int w) { return Box.createHorizontalStrut(w); }
    public static Component vstrut(int h) { return Box.createVerticalStrut(h); }

    public static void onHover(JComponent c, Supplier<Boolean> state) { }

    /** 让组件在布局里占满宽度。 */
    public static JPanel fullWidth(JComponent inner) {
        JPanel p = new JPanel(new BorderLayout());
        p.setOpaque(false);
        p.add(inner, BorderLayout.CENTER);
        return p;
    }
}
