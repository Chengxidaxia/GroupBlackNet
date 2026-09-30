package com.groupblacknet.client.ui;

import com.groupblacknet.client.core.Api;
import com.groupblacknet.client.core.Config;
import com.groupblacknet.client.core.MetaParser;
import com.groupblacknet.client.core.Model;
import com.groupblacknet.client.core.Theme;

import java.awt.*;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.event.DocumentEvent;
import javax.swing.event.DocumentListener;

/**
 * 首页：公告置顶 Hero + 分类筛选 + 排序/升序/搜索 + 卡片流 + 热门榜/标签 + 分页。
 * 排序与分页语义与站点 main.js 对齐。
 */
public class HomePanel extends JPanel {

    /** 卡片统一高度（封面 168 + 正文区） */
    private static final int CARD_HEIGHT = 344;

    private final MainFrame app;

    /* 状态 */
    private List<Model.Post> allPosts = new ArrayList<>();
    private int page = 1;
    private String sort = "默认";
    private boolean ascending = false;
    private String query = "";
    private int catFilter = 0;
    private boolean loading;
    private boolean loadedOnce;

    /* 组件 */
    private final JPanel content = Ui.scrollColumn();
    private final JPanel heroRow = new JPanel();
    private final JPanel tabsRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
    private final JPanel cardsGrid = Ui.vboxClear();
    private final JPanel sidebar = Ui.vboxClear();
    private final JPanel pager = new JPanel(new FlowLayout(FlowLayout.CENTER, 6, 0));
    private final JLabel countHint = Ui.muted("", 12);
    private final JPanel sortRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 4, 0));
    private final JCheckBox ascBox = new JCheckBox("升序");
    private JTextField searchField;

    public HomePanel(MainFrame app) {
        this.app = app;
        setLayout(new BorderLayout());
        setBackground(Theme.t().bg);
        putClientProperty("gbBg", "bg");
        Ui.themed(this, t -> t.bg);

        buildControls();

        content.setBorder(new EmptyBorder(20, 24, 28, 24));
        content.add(heroRow);
        content.add(Ui.vstrut(18));
        content.add(controlsRow());
        content.add(Ui.vstrut(16));

        JPanel body = new JPanel();
        body.setLayout(new BoxLayout(body, BoxLayout.X_AXIS));
        body.setOpaque(false);
        cardsGrid.setOpaque(false);
        JScrollPane gridScroll = null;
        body.add(cardsGrid);
        body.add(Ui.hstrut(20));
        sidebar.setPreferredSize(new Dimension(272, 10));
        sidebar.setMinimumSize(new Dimension(272, 10));
        sidebar.setMaximumSize(new Dimension(272, Integer.MAX_VALUE));
        body.add(sidebar);
        content.add(body);
        content.add(Ui.vstrut(14));
        content.add(pager);

        add(Ui.scroll(content), BorderLayout.CENTER);
    }

    /* ---------------- 控件 ---------------- */

    private JPanel controlsRow() {
        JPanel row = new JPanel(new BorderLayout());
        row.setOpaque(false);
        tabsRow.setOpaque(false);
        row.add(tabsRow, BorderLayout.WEST);

        JPanel right = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        right.setOpaque(false);
        right.add(countHint);
        sortRow.setOpaque(false);
        renderSortButtons();
        ascBox.setFont(Ui.font(12));
        ascBox.setOpaque(false);
        ascBox.setForeground(Theme.t().ink2);
        ascBox.addActionListener(e -> {
            ascending = ascBox.isSelected();
            page = 1;
            renderList();
        });
        right.add(Ui.muted("排序", 12));
        right.add(sortRow);
        right.add(ascBox);
        right.add(searchField());
        row.add(right, BorderLayout.EAST);
        return row;
    }

    /** 排序：分段按钮（自绘，暗色下也正常）。 */
    private void renderSortButtons() {
        sortRow.removeAll();
        for (String name : new String[]{"默认", "创建时间", "修改时间", "点赞数"}) {
            boolean on = name.equals(sort);
            JButton b = on ? Ui.primary(name) : Ui.ghost(name);
            b.setFont(Ui.font(12));
            b.addActionListener(e -> {
                sort = name;
                page = 1;
                renderSortButtons();
                renderList();
            });
            sortRow.add(b);
        }
        sortRow.revalidate();
        sortRow.repaint();
    }

    private JTextField searchField() {
        // 用 JTextField 子类自绘占位符（比自定义 UI 委托可靠）
        searchField = new JTextField(18) {
            @Override protected void paintComponent(Graphics g) {
                super.paintComponent(g);
                if (getText().isEmpty()) {
                    Graphics2D g2 = (Graphics2D) g.create();
                    g2.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING,
                            RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
                    g2.setColor(Theme.t().muted);
                    g2.setFont(Ui.font(13));
                    Insets in = getInsets();
                    FontMetrics fm = g2.getFontMetrics();
                    g2.drawString("搜索标题 / 正文…", in.left + 2,
                            (getHeight() + fm.getAscent() - fm.getDescent()) / 2);
                    g2.dispose();
                }
            }
        };
        searchField.setFont(Ui.font(13));
        searchField.putClientProperty("gbBg", "bg");
        searchField.setBackground(Theme.t().bg);
        searchField.setForeground(Theme.t().ink);
        searchField.setCaretColor(Theme.t().ink);
        searchField.setBorder(BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(Theme.t().line2, 1, true),
                new EmptyBorder(6, 10, 6, 10)));
        searchField.setToolTipText("搜索标题与正文");
        searchField.getDocument().addDocumentListener(new DocumentListener() {
            private void changed() {
                query = searchField.getText().trim();
                page = 1;
                renderList();
            }
            @Override public void insertUpdate(DocumentEvent e) { changed(); }
            @Override public void removeUpdate(DocumentEvent e) { changed(); }
            @Override public void changedUpdate(DocumentEvent e) { changed(); }
        });
        return searchField;
    }

    private void buildControls() {
        heroRow.setLayout(new BorderLayout(14, 0));
        heroRow.setOpaque(false);
        heroRow.setAlignmentX(Component.LEFT_ALIGNMENT);
    }

    /* ---------------- 数据 ---------------- */

    public void reload() {
        if (loading) return;
        loading = true;
        showLoading();
        Api.async(Api::fetchAll, posts -> {
            loading = false;
            loadedOnce = true;
            allPosts = posts;
            renderAll();
        }, e -> {
            loading = false;
            cardsGrid.removeAll();
            cardsGrid.add(Ui.emptyNote("加载失败：" + (e.getMessage() == null ? "网络错误" : e.getMessage())));
            cardsGrid.add(Ui.emptyNote("点击工具栏「写稿」需先登录；数据来自 api.blacknet.cc.cd"));
            cardsGrid.revalidate();
            cardsGrid.repaint();
        });
    }

    private void showLoading() {
        cardsGrid.removeAll();
        cardsGrid.add(Ui.spinner("正在加载文章…"));
        cardsGrid.revalidate();
        cardsGrid.repaint();
        heroRow.removeAll();
        heroRow.revalidate();
        heroRow.repaint();
        sidebar.removeAll();
        sidebar.revalidate();
        sidebar.repaint();
        pager.removeAll();
        pager.revalidate();
        pager.repaint();
    }

    public void refreshCategories() {
        renderTabs();
        renderSidebar();
    }

    /* ---------------- 渲染 ---------------- */

    private void renderAll() {
        renderHero();
        renderTabs();
        renderSidebar();
        renderList();
    }

    /** 默认排序：公告置顶（各自按创建时间倒序） */
    private List<Model.Post> defaultOrder(List<Model.Post> posts) {
        List<Model.Post> ann = new ArrayList<>();
        List<Model.Post> rest = new ArrayList<>();
        for (Model.Post p : posts) (MetaParser.isAnnouncement(p) ? ann : rest).add(p);
        Comparator<Model.Post> byCreateDesc = (a, b) -> b.createdAt().compareTo(a.createdAt());
        ann.sort(byCreateDesc);
        rest.sort(byCreateDesc);
        ann.addAll(rest);
        return ann;
    }

    private List<Model.Post> sorted(List<Model.Post> posts) {
        List<Model.Post> arr = new ArrayList<>(posts);
        switch (sort) {
            case "默认" -> {
                if (query.isEmpty() && catFilter == 0) return defaultOrder(arr);
                arr.sort((a, b) -> b.createdAt().compareTo(a.createdAt()));
            }
            case "创建时间" -> arr.sort(Comparator.comparing(Model.Post::createdAt));
            case "修改时间" -> arr.sort(Comparator.comparing(Model.Post::updatedAt));
            case "点赞数" -> arr.sort(Comparator.comparingInt(MetaParser::upCount));
            default -> arr.sort((a, b) -> b.createdAt().compareTo(a.createdAt()));
        }
        if (!ascending) java.util.Collections.reverse(arr);
        return arr;
    }

    private List<Model.Post> filtered() {
        List<Model.Post> arr = allPosts;
        if (catFilter != 0) {
            List<Model.Post> f = new ArrayList<>();
            for (Model.Post p : arr) if (MetaParser.catIdOf(p) == catFilter) f.add(p);
            arr = f;
        }
        if (!query.isEmpty()) {
            String q = query.toLowerCase(Locale.ROOT);
            List<Model.Post> f = new ArrayList<>();
            for (Model.Post p : arr) {
                String t = (p.title() == null ? "" : p.title()).toLowerCase(Locale.ROOT);
                String b = (p.body() == null ? "" : p.body()).toLowerCase(Locale.ROOT);
                if (t.contains(q) || b.contains(q)) f.add(p);
            }
            arr = f;
        }
        return sorted(arr);
    }

    /* ---------------- Hero ---------------- */

    private void renderHero() {
        heroRow.removeAll();
        List<Model.Post> order = defaultOrder(allPosts);
        if (order.isEmpty()) {
            heroRow.add(Ui.emptyNote("还没有内容，登录后点右上角「写稿」发布第一篇。"));
            heroRow.revalidate();
            heroRow.repaint();
            return;
        }
        Model.Post h = order.get(0);
        int catId = MetaParser.catIdOf(h);
        Model.Category cat = MetaParser.catInfo(catId, h.categoryName());

        JPanel hero = Ui.card();
        hero.setPreferredSize(new Dimension(10, 320));
        hero.setMaximumSize(new Dimension(Integer.MAX_VALUE, 320));
        hero.setLayout(new BorderLayout());
        Ui.CoverView cover = new Ui.CoverView(h.meta(), catId, 16, 54);
        hero.add(cover, BorderLayout.CENTER);

        JPanel info = new JPanel();
        info.setLayout(new BoxLayout(info, BoxLayout.Y_AXIS));
        info.setOpaque(false);
        info.setBorder(new EmptyBorder(0, 20, 18, 20));
        if (!MetaParser.isGeneral(catId, cat.name())) {
            JPanel chipRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 0, 0));
            chipRow.setOpaque(false);
            String text = (MetaParser.isAnnouncement(h) ? "置顶 · " : "") + cat.name();
            chipRow.add(Ui.chip(text, Theme.hueColor(cat.hue(), 0.62f, 0.42f)));
            chipRow.setAlignmentX(Component.LEFT_ALIGNMENT);
            info.add(chipRow);
            info.add(Ui.vstrut(8));
        }
        JLabel title = Ui.inkBold(h.titleOr(), 24);
        title.setAlignmentX(Component.LEFT_ALIGNMENT);
        info.add(title);
        if (!h.excerpt().isBlank()) {
            info.add(Ui.vstrut(6));
            JLabel ex = Ui.ink2(h.excerpt(), 13);
            ex.setAlignmentX(Component.LEFT_ALIGNMENT);
            info.add(ex);
        }
        info.add(Ui.vstrut(10));
        info.add(byline(h));
        hero.add(info, BorderLayout.SOUTH);
        hero.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        hero.addMouseListener(new MouseAdapter() {
            @Override public void mouseClicked(MouseEvent e) { app.showDetail(h.number()); }
        });

        JPanel side = Ui.vboxClear();
        side.setPreferredSize(new Dimension(330, 10));
        side.setMinimumSize(new Dimension(330, 10));
        side.setMaximumSize(new Dimension(330, Integer.MAX_VALUE));
        for (Model.Post p : order.subList(1, Math.min(Config.HERO_COUNT, order.size()))) {
            side.add(sideItem(p));
            side.add(Ui.vstrut(10));
        }

        heroRow.add(hero, BorderLayout.CENTER);
        heroRow.add(side, BorderLayout.EAST);
        heroRow.revalidate();
        heroRow.repaint();
    }

    private JPanel sideItem(Model.Post p) {
        int catId = MetaParser.catIdOf(p);
        Model.Category cat = MetaParser.catInfo(catId, p.categoryName());
        JPanel item = Ui.card();
        item.setLayout(new BorderLayout(12, 0));
        item.setBorder(new EmptyBorder(10, 10, 10, 12));
        item.setPreferredSize(new Dimension(10, 104));
        item.setMaximumSize(new Dimension(Integer.MAX_VALUE, 104));
        Ui.CoverView thumb = new Ui.CoverView(p.meta(), catId, 8, 22);
        thumb.setPreferredSize(new Dimension(112, 84));
        item.add(thumb, BorderLayout.WEST);

        JPanel box = new JPanel();
        box.setLayout(new BoxLayout(box, BoxLayout.Y_AXIS));
        box.setOpaque(false);
        if (!MetaParser.isGeneral(catId, cat.name())) {
            JLabel tag = Ui.accent("# " + cat.name(), 11);
            tag.setAlignmentX(Component.LEFT_ALIGNMENT);
            box.add(tag);
        }
        JLabel t = Ui.inkBold(p.titleOr(), 14);
        t.setAlignmentX(Component.LEFT_ALIGNMENT);
        box.add(t);
        box.add(Ui.vstrut(4));
        JPanel metaRow = Ui.hbox();
        metaRow.setAlignmentX(Component.LEFT_ALIGNMENT);
        metaRow.add(Ui.muted(MetaParser.fmtShort(p.createdAt()) + " ·", 11));
        metaRow.add(Ui.emojiMuted("🔥", 11));
        metaRow.add(Ui.muted(MetaParser.totalReactions(p.reactions()) + " ·", 11));
        metaRow.add(Ui.emojiMuted("💬", 11));
        metaRow.add(Ui.muted(String.valueOf(p.commentCount()), 11));
        box.add(metaRow);
        item.add(box, BorderLayout.CENTER);

        item.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        item.addMouseListener(new MouseAdapter() {
            @Override public void mouseClicked(MouseEvent e) { app.showDetail(p.number()); }
        });
        return item;
    }

    private JPanel byline(Model.Post p) {
        JPanel by = Ui.hbox();
        by.setAlignmentX(Component.LEFT_ALIGNMENT);
        by.add(new Ui.AvatarView(p.author(), 24));
        by.add(Ui.ink2(p.author().name(), 12));
        by.add(Ui.muted("· " + MetaParser.fmtShort(p.createdAt()), 12));
        by.add(Ui.muted("· ↑ " + MetaParser.upCount(p), 12));
        by.add(Ui.muted("·", 12));
        by.add(Ui.emojiMuted("💬", 12));
        by.add(Ui.muted(p.commentCount() + "", 12));
        return by;
    }

    /* ---------------- 分类 tabs ---------------- */

    private void renderTabs() {
        tabsRow.removeAll();
        tabsRow.add(tabButton("全部", 0));
        for (Model.Category c : MetaParser.cats()) {
            if (MetaParser.isGeneral(c.id(), c.name())) continue;
            tabsRow.add(tabButton(c.name(), c.id()));
        }
        tabsRow.revalidate();
        tabsRow.repaint();
    }

    private JComponent tabButton(String name, int catId) {
        boolean on = catFilter == catId;
        JButton b = on ? Ui.primary(name) : Ui.ghost(name);
        b.setFont(Ui.font(12, Font.BOLD));
        b.addActionListener(e -> {
            catFilter = catId;
            page = 1;
            renderTabs();
            renderList();
            javax.swing.SwingUtilities.invokeLater(() ->
                    content.scrollRectToVisible(new Rectangle(0, 0, 1, 1)));
        });
        return b;
    }

    /* ---------------- 侧栏：热门榜 / 标签 ---------------- */

    private void renderSidebar() {
        sidebar.removeAll();
        sidebar.setOpaque(false);

        JPanel rank = Ui.card();
        rank.setLayout(new BoxLayout(rank, BoxLayout.Y_AXIS));
        rank.setBorder(new EmptyBorder(14, 16, 16, 16));
        JPanel rankTitle = Ui.hbox();
        rankTitle.setAlignmentX(Component.LEFT_ALIGNMENT);
        rankTitle.add(Ui.emojiAccent("🔥", 14));
        rankTitle.add(Ui.inkBold("热门榜", 14));
        rank.add(rankTitle);
        rank.add(Ui.vstrut(10));
        List<Model.Post> top = new ArrayList<>(allPosts);
        top.sort((a, b) -> MetaParser.totalReactions(b.reactions()) - MetaParser.totalReactions(a.reactions()));
        int i = 0;
        for (Model.Post p : top.subList(0, Math.min(5, top.size()))) {
            i++;
            JLabel l = Ui.ink2(i + ". " + p.titleOr(), 12);
            l.setAlignmentX(Component.LEFT_ALIGNMENT);
            l.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
            l.addMouseListener(new MouseAdapter() {
                @Override public void mouseClicked(MouseEvent e) { app.showDetail(p.number()); }
            });
            rank.add(l);
            rank.add(Ui.vstrut(6));
        }
        sidebar.add(rank);
        sidebar.add(Ui.vstrut(14));

        JPanel tags = Ui.card();
        tags.setLayout(new BoxLayout(tags, BoxLayout.Y_AXIS));
        tags.setBorder(new EmptyBorder(14, 16, 16, 16));
        JLabel tt = Ui.inkBold("# 分类", 14);
        tt.setAlignmentX(Component.LEFT_ALIGNMENT);
        tags.add(tt);
        tags.add(Ui.vstrut(8));
        JPanel cloud = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 6));
        cloud.setOpaque(false);
        for (Model.Category c : MetaParser.cats()) {
            if (MetaParser.isGeneral(c.id(), c.name())) continue;
            JLabel chip = Ui.chip(c.name(), Theme.hueColor(c.hue(), 0.62f, 0.45f));
            chip.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
            chip.addMouseListener(new MouseAdapter() {
                @Override public void mouseClicked(MouseEvent e) {
                    catFilter = c.id();
                    page = 1;
                    renderTabs();
                    renderList();
                }
            });
            cloud.add(chip);
        }
        tags.add(cloud);
        sidebar.add(tags);
        sidebar.revalidate();
        sidebar.repaint();
    }

    /* ---------------- 卡片流 + 分页 ---------------- */

    private void renderList() {
        List<Model.Post> data = filtered();
        countHint.setText("共 " + data.size() + " 篇");

        cardsGrid.removeAll();
        cardsGrid.setOpaque(false);
        if (data.isEmpty()) {
            cardsGrid.add(Ui.emptyNote("没有匹配的内容" + (query.isEmpty() ? "。" : "（试试别的关键词）。")));
            pager.removeAll();
            pager.revalidate();
            pager.repaint();
            cardsGrid.revalidate();
            cardsGrid.repaint();
            return;
        }
        int totalPages = Math.max(1, (int) Math.ceil(data.size() / (double) Config.PAGE_SIZE));
        if (page > totalPages) page = totalPages;
        int start = (page - 1) * Config.PAGE_SIZE;
        int end = Math.min(data.size(), start + Config.PAGE_SIZE);

        List<Model.Post> pageItems = data.subList(start, end);
        for (int i = 0; i < pageItems.size(); i += 2) {
            JPanel row = new JPanel(new GridLayout(1, 2, 16, 0));
            row.setOpaque(false);
            row.setAlignmentX(Component.LEFT_ALIGNMENT);
            row.add(card(pageItems.get(i)));
            if (i + 1 < pageItems.size()) {
                row.add(card(pageItems.get(i + 1)));
            } else {
                JPanel filler = new JPanel();
                filler.setOpaque(false);
                row.add(filler);
            }
            row.setPreferredSize(new Dimension(10, CARD_HEIGHT));
            row.setMaximumSize(new Dimension(Integer.MAX_VALUE, CARD_HEIGHT));
            cardsGrid.add(row);
            cardsGrid.add(Ui.vstrut(16));
        }
        cardsGrid.revalidate();
        cardsGrid.repaint();
        renderPager(totalPages);
    }

    private JComponent card(Model.Post p) {
        int catId = MetaParser.catIdOf(p);
        Model.Category cat = MetaParser.catInfo(catId, p.categoryName());

        JPanel card = Ui.card();
        card.setLayout(new BorderLayout());
        card.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        // 固定高度：同一屏里所有卡片尺寸一致（GridLayout 各行的首选高相同）
        card.setPreferredSize(new Dimension(360, CARD_HEIGHT));
        card.setMinimumSize(new Dimension(220, CARD_HEIGHT));
        card.setMaximumSize(new Dimension(Integer.MAX_VALUE, CARD_HEIGHT));

        // 封面 + 角标（角标浮在封面上）
        JPanel coverBox = new JPanel(null) {
            @Override public void doLayout() {
                for (Component c : getComponents()) {
                    if ("cover".equals(((JComponent) c).getClientProperty("role"))) c.setBounds(0, 0, getWidth(), getHeight());
                    else {
                        Dimension d = c.getPreferredSize();
                        c.setBounds(12, 12, d.width, d.height);
                    }
                }
            }
        };
        coverBox.setOpaque(false);
        coverBox.setPreferredSize(new Dimension(10, 168));
        Ui.CoverView cover = new Ui.CoverView(p.meta(), catId, 0, 34);
        cover.putClientProperty("role", "cover");
        coverBox.add(cover);
        if (!MetaParser.isGeneral(catId, cat.name())) {
            coverBox.add(Ui.chip(cat.name(), Theme.hueColor(cat.hue(), 0.62f, 0.42f)));
        }
        card.add(coverBox, BorderLayout.NORTH);

        JPanel body = new JPanel();
        body.setLayout(new BoxLayout(body, BoxLayout.Y_AXIS));
        body.setOpaque(false);
        body.setBorder(new EmptyBorder(12, 16, 14, 16));
        JLabel t = Ui.inkBold(p.titleOr(), 15);
        t.setAlignmentX(Component.LEFT_ALIGNMENT);
        body.add(t);
        String ex = p.excerpt();
        if (ex == null || ex.isBlank()) ex = com.groupblacknet.client.core.Markdown.plain(p.meta().bodyText(), 80);
        if (!ex.isBlank()) {
            body.add(Ui.vstrut(6));
            JLabel l = Ui.ink2(ex, 12);
            l.setAlignmentX(Component.LEFT_ALIGNMENT);
            body.add(l);
        }
        body.add(Ui.vstrut(10));
        JPanel foot = Ui.hbox();
        foot.setAlignmentX(Component.LEFT_ALIGNMENT);
        foot.add(new Ui.AvatarView(p.author(), 20));
        foot.add(Ui.muted(p.author().name(), 11));
        foot.add(Ui.muted("· " + MetaParser.fmtShort(p.createdAt()), 11));
        foot.add(Ui.muted("·", 11));
        foot.add(Ui.emojiMuted("💬", 11));
        foot.add(Ui.muted(String.valueOf(p.commentCount()), 11));
        for (Model.Reaction r : MetaParser.meaningfulReactions(p.reactions())) {
            foot.add(Ui.muted(MetaParser.emojiOf(r.content()) + " " + r.count(), 11));
        }
        body.add(foot);
        card.add(body, BorderLayout.CENTER);

        card.addMouseListener(new MouseAdapter() {
            @Override public void mouseClicked(MouseEvent e) { app.showDetail(p.number()); }
        });
        return Ui.fullWidth(card);
    }

    private void renderPager(int totalPages) {
        pager.removeAll();
        pager.setOpaque(false);
        if (totalPages > 1) {
            JButton prev = Ui.ghost("‹");
            prev.setEnabled(page > 1);
            prev.addActionListener(e -> { page--; renderList(); scrollToTop(); });
            pager.add(prev);

            int maxVisible = 5;
            List<Object> items = new ArrayList<>();
            if (totalPages <= maxVisible + 2) {
                for (int i = 1; i <= totalPages; i++) items.add(i);
            } else {
                items.add(1);
                int s = Math.max(2, page - 2);
                int en = Math.min(totalPages - 1, page + 2);
                if (en - s < maxVisible - 1) {
                    if (s == 2) en = Math.min(totalPages - 1, s + maxVisible - 2);
                    else if (en == totalPages - 1) s = Math.max(2, en - maxVisible + 2);
                }
                if (s > 2) items.add("…");
                for (int i = s; i <= en; i++) items.add(i);
                if (en < totalPages - 1) items.add("…");
                items.add(totalPages);
            }
            for (Object it : items) {
                if (it instanceof Integer n) {
                    JButton b = n == page ? Ui.primary(String.valueOf(n)) : Ui.ghost(String.valueOf(n));
                    b.addActionListener(e -> { page = n; renderList(); scrollToTop(); });
                    pager.add(b);
                } else {
                    JLabel dots = Ui.muted("…", 14);
                    dots.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
                    dots.addMouseListener(new MouseAdapter() {
                        @Override public void mouseClicked(MouseEvent e) { jump(totalPages); }
                    });
                    pager.add(dots);
                }
            }
            JButton next = Ui.ghost("›");
            next.setEnabled(page < totalPages);
            next.addActionListener(e -> { page++; renderList(); scrollToTop(); });
            pager.add(next);
        }
        pager.revalidate();
        pager.repaint();
    }

    private void jump(int totalPages) {
        String v = Ui.prompt(this, "跳转页码", "输入 1 - " + totalPages + " 之间的页码", String.valueOf(page));
        if (v == null) return;
        try {
            int n = Integer.parseInt(v.trim());
            if (n >= 1 && n <= totalPages) { page = n; renderList(); scrollToTop(); }
            else Ui.toast("请输入 1 - " + totalPages + " 之间的页码");
        } catch (NumberFormatException e) {
            Ui.toast("请输入数字");
        }
    }

    private void scrollToTop() {
        SwingUtilities.invokeLater(() -> content.scrollRectToVisible(new Rectangle(0, 0, 1, 1)));
    }
}
