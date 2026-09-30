package com.groupblacknet.client.ui;

import com.groupblacknet.client.core.Api;
import com.groupblacknet.client.core.Config;
import com.groupblacknet.client.core.Markdown;
import com.groupblacknet.client.core.MetaParser;
import com.groupblacknet.client.core.Model;
import com.groupblacknet.client.core.Session;
import com.groupblacknet.client.core.Theme;

import java.awt.*;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.event.HyperlinkEvent;

/**
 * 详情页：封面 + 标题/元信息 + Markdown 正文 + 顶/多表情反应 + 评论（嵌套回复、表情、分页）+ 相关阅读。
 * 交互与站点 blog.js 对齐（乐观更新 + 失败回滚）。
 */
public class DetailPanel extends JPanel {

    private final MainFrame app;
    private final JPanel content = Ui.scrollColumn();
    private final JScrollPane scroll;

    private int number;
    private Model.Discussion data;
    private final Set<String> myReactions = new HashSet<>();
    private String replyToId = null;
    private String replyToName = null;
    private boolean busy;

    private JPanel commentList;
    private JTextArea commentInput;
    private JLabel replyHint;
    private JButton sendBtn;

    public DetailPanel(MainFrame app) {
        this.app = app;
        setLayout(new BorderLayout());
        setBackground(Theme.t().bg);
        putClientProperty("gbBg", "bg");
        Ui.themed(this, t -> t.bg);

        content.setBorder(new EmptyBorder(20, 26, 34, 26));
        scroll = Ui.scroll(content);
        add(scroll, BorderLayout.CENTER);
    }

    /* ---------------- 打开文章 ---------------- */

    public void open(int number) {
        this.number = number;
        content.removeAll();
        content.add(Ui.spinner("正在加载文章…"));
        content.revalidate();
        content.repaint();
        SwingUtilities.invokeLater(() -> scroll.getVerticalScrollBar().setValue(0));

        Api.async(() -> Api.discussion(number, Config.COMMENTS_FIRST, null), d -> {
            data = d;
            myReactions.clear();
            collectMyReactions(d);
            render();
            loadRelated(d);
        }, e -> {
            content.removeAll();
            content.add(Ui.emptyNote("加载失败：" + (e.getMessage() == null ? "网络错误" : e.getMessage())));
            JButton back = Ui.ghost("返回首页");
            back.addActionListener(ev -> app.showHome());
            JPanel row = new JPanel(new FlowLayout(FlowLayout.LEFT));
            row.setOpaque(false);
            row.add(back);
            content.add(row);
            content.revalidate();
            content.repaint();
        });
    }

    private void collectMyReactions(Model.Discussion d) {
        if (Session.loggedIn()) {
            for (Model.Reaction r : d.post().reactions()) {
                if (r.viewerHasReacted()) myReactions.add(d.post().id() + "|" + r.content());
            }
            if (d.post().viewerHasUpvoted()) myReactions.add(d.post().id() + "|UPVOTE");
            collectCommentReactions(d.comments());
        }
    }

    private void collectCommentReactions(List<Model.Comment> list) {
        for (Model.Comment c : list) {
            for (Model.Reaction r : c.reactions()) {
                if (r.viewerHasReacted()) myReactions.add(c.id() + "|" + r.content());
            }
            if (c.viewerHasUpvoted()) myReactions.add(c.id() + "|UPVOTE");
            collectCommentReactions(c.replies());
        }
    }

    /* ---------------- 渲染 ---------------- */

    private void render() {
        content.removeAll();

        // 顶部：返回 + 面包屑
        JPanel topBar = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        topBar.setOpaque(false);
        JButton back = Ui.ghost("‹ 返回");
        back.addActionListener(e -> app.showHome());
        topBar.add(back);
        topBar.add(Ui.muted("首页 / 正文", 12));
        topBar.setAlignmentX(Component.LEFT_ALIGNMENT);
        content.add(topBar);
        content.add(Ui.vstrut(14));

        Model.Post p = data.post();
        int catId = MetaParser.catIdOf(p);
        Model.Category cat = MetaParser.catInfo(catId, p.categoryName());

        // 头部：左封面 + 右标题区（对齐站点：封面在标题左侧）
        JPanel head = new JPanel(new BorderLayout(22, 0));
        head.setOpaque(false);
        head.setAlignmentX(Component.LEFT_ALIGNMENT);
        Ui.CoverView cover = new Ui.CoverView(p.meta(), catId, 14, 40);
        cover.setPreferredSize(new Dimension(300, 200));
        cover.setMinimumSize(new Dimension(300, 200));
        cover.setMaximumSize(new Dimension(300, 200));
        head.add(cover, BorderLayout.WEST);

        JPanel titleBox = new JPanel();
        titleBox.setLayout(new BoxLayout(titleBox, BoxLayout.Y_AXIS));
        titleBox.setOpaque(false);
        if (!MetaParser.isGeneral(catId, cat.name())) {
            JPanel chipRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 0, 0));
            chipRow.setOpaque(false);
            chipRow.add(Ui.chip(cat.name(), Theme.hueColor(cat.hue(), 0.62f, 0.42f)));
            chipRow.setAlignmentX(Component.LEFT_ALIGNMENT);
            titleBox.add(chipRow);
            titleBox.add(Ui.vstrut(10));
        }
        JLabel title = Ui.inkBold(p.titleOr(), 26);
        title.setAlignmentX(Component.LEFT_ALIGNMENT);
        titleBox.add(title);
        titleBox.add(Ui.vstrut(10));
        JPanel by = Ui.hbox();
        by.setAlignmentX(Component.LEFT_ALIGNMENT);
        by.add(new Ui.AvatarView(p.author(), 26));
        by.add(Ui.ink2(p.author().name(), 13));
        by.add(Ui.muted("· " + MetaParser.fmtFull(p.createdAt()), 12));
        by.add(Ui.muted("· ↑ " + MetaParser.upCount(p), 12));
        by.add(Ui.muted("·", 12));
        by.add(Ui.emojiMuted("💬", 12));
        by.add(Ui.muted(String.valueOf(data.commentTotal()), 12));
        titleBox.add(by);
        titleBox.add(Ui.vstrut(10));
        JLabel src = Ui.muted("#" + p.number() + " · 数据来源：GitHub Discussions", 11);
        src.setAlignmentX(Component.LEFT_ALIGNMENT);
        titleBox.add(src);
        head.add(titleBox, BorderLayout.CENTER);
        content.add(head);

        content.add(Ui.vstrut(16));
        content.add(Ui.hline());
        content.add(Ui.vstrut(18));

        // 正文
        JEditorPane body = htmlPane();
        body.setText(Markdown.toHtml(p.meta().bodyText()));
        body.setAlignmentX(Component.LEFT_ALIGNMENT);
        content.add(body);
        content.add(Ui.vstrut(20));

        // 反应条
        content.add(reactionBar(p));
        content.add(Ui.vstrut(18));
        content.add(Ui.hline());
        content.add(Ui.vstrut(18));

        // 评论区
        JPanel cmHead = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        cmHead.setOpaque(false);
        cmHead.setAlignmentX(Component.LEFT_ALIGNMENT);
        cmHead.add(Ui.inkBold("评论", 17));
        cmHead.add(Ui.muted(data.commentTotal() + " 条", 12));
        content.add(cmHead);
        content.add(Ui.vstrut(12));

        if (p.meta().allowComments()) {
            content.add(commentComposer());
        } else {
            content.add(Ui.muted("作者关闭了这篇文章的评论。", 13));
        }
        content.add(Ui.vstrut(16));

        commentList = Ui.vboxClear();
        commentList.setOpaque(false);
        commentList.setAlignmentX(Component.LEFT_ALIGNMENT);
        renderComments();
        content.add(commentList);

        if (data.commentsHasNext()) {
            JButton more = Ui.ghost("加载更多评论");
            more.setAlignmentX(Component.LEFT_ALIGNMENT);
            more.addActionListener(e -> loadMoreComments(more));
            content.add(Ui.vstrut(10));
            content.add(more);
        }

        content.add(Ui.vstrut(24));
        content.add(Ui.hline());
        content.add(Ui.vstrut(18));
        JPanel relBox = Ui.vboxClear();
        relBox.setOpaque(false);
        relBox.setAlignmentX(Component.LEFT_ALIGNMENT);
        relBox.add(Ui.inkBold("相关阅读", 17));
        relBox.add(Ui.vstrut(12));
        relBox.putClientProperty("related", "1");
        relatedBox = relBox;
        content.add(relBox);

        content.revalidate();
        content.repaint();
    }

    private JPanel relatedBox;

    private JEditorPane htmlPane() {
        JEditorPane pane = new JEditorPane("text/html", "");
        pane.setEditable(false);
        pane.setOpaque(true);
        pane.setBackground(Theme.t().bg);
        pane.putClientProperty("gbBg", "bg");
        pane.setBorder(null);
        pane.setMargin(new Insets(0, 0, 0, 0));
        pane.addHyperlinkListener(e -> {
            if (e.getEventType() == HyperlinkEvent.EventType.ACTIVATED && e.getURL() != null) {
                Ui.browse(e.getURL().toString());
            }
        });
        return pane;
    }

    /* ---------------- 反应条 ---------------- */

    private JPanel reactionBar(Model.Post p) {
        JPanel bar = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 6));
        bar.setOpaque(false);
        bar.setAlignmentX(Component.LEFT_ALIGNMENT);

        boolean upOn = myReactions.contains(p.id() + "|UPVOTE");
        int up = MetaParser.upCount(p);
        bar.add(reactionButton(p.id(), "UPVOTE", "↑", up, upOn));

        for (Model.Reaction r : MetaParser.meaningfulReactions(p.reactions())) {
            if ("THUMBS_UP".equals(r.content())) continue;   // 顶已单独呈现
            boolean on = myReactions.contains(p.id() + "|" + r.content());
            bar.add(reactionButton(p.id(), r.content(), MetaParser.emojiOf(r.content()), r.count(), on));
        }

        JButton add = Ui.ghost("＋ 表情");
        add.setToolTipText("添加一个表情反应");
        add.addActionListener(e -> showEmojiPicker(add, p.id(), null));
        bar.add(add);
        return bar;
    }

    private JButton reactionButton(String subjectId, String content, String label, int count, boolean on) {
        JButton b = on ? Ui.primary(label + " " + count) : Ui.ghost(label + " " + count);
        b.setFont(Ui.font(12, Font.BOLD));
        b.setToolTipText("UPVOTE".equals(content) ? "顶" : "表情反应");
        b.addActionListener(e -> toggleReaction(b, subjectId, content, count, on));
        return b;
    }

    private void toggleReaction(JButton btn, String subjectId, String content, int count, boolean wasOn) {
        if (!Session.loggedIn()) {
            Ui.toast("请先登录");
            return;
        }
        if (busy) return;
        boolean next = !wasOn;
        String key = subjectId + "|" + content;
        // 乐观更新
        if (next) myReactions.add(key); else myReactions.remove(key);
        applyButton(btn, content, count + (next ? 1 : -1), next);

        Api.async(() -> {
            Api.react(subjectId, content, next);
            return null;
        }, v -> { /* 成功保持 */ }, e -> {
            // 回滚
            if (next) myReactions.remove(key); else myReactions.add(key);
            applyButton(btn, content, count, wasOn);
            Ui.toast("操作失败：" + (e.getMessage() == null ? "网络错误" : e.getMessage()));
        });
    }

    private void applyButton(JButton btn, String content, int count, boolean on) {
        String label = "UPVOTE".equals(content) ? "↑" : MetaParser.emojiOf(content);
        btn.setText(label + " " + Math.max(0, count));
        btn.setForeground(on ? Theme.t().onAccent : Theme.t().ink2);
        btn.putClientProperty("on", on);
        btn.repaint();
    }

    /** 表情选择：选中已有表情则切换，否则新增。 */
    private void showEmojiPicker(JComponent anchor, String subjectId, Runnable afterAdd) {
        JPopupMenu menu = new JPopupMenu();
        menu.setBorder(BorderFactory.createLineBorder(Theme.t().line2));
        menu.setBackground(Theme.t().paper);
        for (String content : MetaParser.reactionOptions()) {
            JMenuItem item = new JMenuItem(MetaParser.emojiOf(content) + "  " + content);
            item.setFont(Ui.font(13));
            item.addActionListener(e -> {
                if (!Session.loggedIn()) { Ui.toast("请先登录"); return; }
                boolean has = myReactions.contains(subjectId + "|" + content);
                Api.async(() -> {
                    Api.react(subjectId, content, !has);
                    return null;
                }, v -> {
                    if (has) myReactions.remove(subjectId + "|" + content);
                    else myReactions.add(subjectId + "|" + content);
                    if (afterAdd != null) afterAdd.run();
                    else if (number > 0) silentReload();
                }, err -> Ui.toast("操作失败：" + (err.getMessage() == null ? "网络错误" : err.getMessage())));
            });
            menu.add(item);
        }
        menu.show(anchor, 0, anchor.getHeight() + 2);
    }

    private void silentReload() {
        Api.async(() -> Api.discussion(number, Config.COMMENTS_FIRST, null), d -> {
            data = d;
            myReactions.clear();
            collectMyReactions(d);
            render();
        }, e -> { });
    }

    /* ---------------- 评论 ---------------- */

    private JPanel commentComposer() {
        JPanel box = Ui.card();
        box.setLayout(new BorderLayout(0, 8));
        box.setBorder(new EmptyBorder(12, 14, 12, 14));
        box.setAlignmentX(Component.LEFT_ALIGNMENT);

        commentInput = new JTextArea(3, 40);
        commentInput.setLineWrap(true);
        commentInput.setWrapStyleWord(true);
        commentInput.setFont(Ui.font(13));
        commentInput.setBackground(Theme.t().bg);
        commentInput.setForeground(Theme.t().ink);
        commentInput.setCaretColor(Theme.t().ink);
        commentInput.setBorder(new EmptyBorder(6, 8, 6, 8));
        JScrollPane sp = new JScrollPane(commentInput);
        sp.setBorder(BorderFactory.createLineBorder(Theme.t().line2));
        box.add(sp, BorderLayout.CENTER);

        JPanel actions = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        actions.setOpaque(false);
        sendBtn = Ui.primary("发表评论");
        sendBtn.addActionListener(e -> sendComment());
        replyHint = Ui.muted(Session.loggedIn() ? "支持 Markdown 语法" : "登录后可评论", 11);
        actions.add(sendBtn);
        actions.add(replyHint);
        box.add(actions, BorderLayout.SOUTH);
        return box;
    }

    private void setReplyTarget(Model.Comment c) {
        replyToId = c.id();
        replyToName = c.author().name();
        if (replyHint != null) replyHint.setText("正在回复 @" + replyToName + "（点此取消）");
        if (replyHint != null) {
            for (java.awt.event.MouseListener ml : replyHint.getMouseListeners()) replyHint.removeMouseListener(ml);
            replyHint.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
            replyHint.addMouseListener(new MouseAdapter() {
                @Override public void mouseClicked(MouseEvent e) { clearReply(); }
            });
        }
        if (commentInput != null) {
            commentInput.requestFocusInWindow();
            scroll.getVerticalScrollBar().setValue(Math.max(0, commentInput.getLocationOnScreen().y - 300));
        }
    }

    private void clearReply() {
        replyToId = null;
        replyToName = null;
        if (replyHint != null) replyHint.setText(Session.loggedIn() ? "支持 Markdown 语法" : "登录后可评论");
    }

    private void sendComment() {
        if (!Session.loggedIn()) {
            Ui.toast("请先登录");
            return;
        }
        if (data == null) {
            Ui.toast("文章数据未加载完成");
            return;
        }
        String text = commentInput == null ? "" : commentInput.getText().trim();
        if (text.isEmpty()) {
            Ui.toast("请先输入评论内容");
            return;
        }
        if (busy) return;
        busy = true;
        if (sendBtn != null) sendBtn.setEnabled(false);
        final String body = text;
        final String parent = replyToId;
        Api.async(() -> {
            Api.comment(data.post().id(), body, parent);
            return null;
        }, v -> {
            busy = false;
            if (sendBtn != null) sendBtn.setEnabled(true);
            if (commentInput != null) commentInput.setText("");
            clearReply();
            Ui.toast(parent == null ? "评论已发布" : "回复已发布");
            open(number);
        }, e -> {
            busy = false;
            if (sendBtn != null) sendBtn.setEnabled(true);
            Ui.toast("发布失败：" + (e.getMessage() == null ? "网络错误" : e.getMessage()));
        });
    }

    private void renderComments() {
        commentList.removeAll();
        List<Model.Comment> list = data.comments();
        if (list.isEmpty()) {
            commentList.add(Ui.emptyNote("还没有评论，来说点什么？"));
        } else {
            for (Model.Comment c : list) {
                commentList.add(commentView(c, 0));
                commentList.add(Ui.vstrut(12));
            }
        }
        commentList.revalidate();
        commentList.repaint();
    }

    private JComponent commentView(Model.Comment c, int depth) {
        JPanel box = new JPanel();
        box.setLayout(new BoxLayout(box, BoxLayout.Y_AXIS));
        box.setOpaque(false);
        box.setAlignmentX(Component.LEFT_ALIGNMENT);
        if (depth > 0) box.setBorder(new EmptyBorder(8, 34, 0, 0));

        JPanel head = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));
        head.setOpaque(false);
        head.setAlignmentX(Component.LEFT_ALIGNMENT);
        head.add(new Ui.AvatarView(c.author(), depth > 0 ? 20 : 24));
        head.add(Ui.ink2(c.author().name(), 12));
        head.add(Ui.muted(MetaParser.fmtShort(c.createdAt()), 11));
        box.add(head);

        JEditorPane body = htmlPane();
        String md = c.body() == null ? "" : c.body();
        body.setText(Markdown.toHtml(md));
        body.setAlignmentX(Component.LEFT_ALIGNMENT);
        body.setBorder(new EmptyBorder(6, 34, 4, 0));
        box.add(body);

        JPanel actions = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 2));
        actions.setOpaque(false);
        actions.setBorder(new EmptyBorder(0, 30, 0, 0));
        actions.setAlignmentX(Component.LEFT_ALIGNMENT);
        boolean upOn = myReactions.contains(c.id() + "|UPVOTE");
        actions.add(reactionButton(c.id(), "UPVOTE", "↑", c.upvoteCount(), upOn));
        for (Model.Reaction r : MetaParser.meaningfulReactions(c.reactions())) {
            if ("THUMBS_UP".equals(r.content())) continue;
            boolean on = myReactions.contains(c.id() + "|" + r.content());
            actions.add(reactionButton(c.id(), r.content(), MetaParser.emojiOf(r.content()), r.count(), on));
        }
        JButton add = Ui.ghost("＋");
        add.setToolTipText("添加表情");
        add.addActionListener(e -> showEmojiPicker(add, c.id(), null));
        actions.add(add);
        JButton reply = Ui.ghost("回复");
        reply.addActionListener(e -> setReplyTarget(c));
        actions.add(reply);
        box.add(actions);

        for (Model.Comment r : c.replies()) {
            box.add(commentView(r, depth + 1));
        }
        return box;
    }

    private void loadMoreComments(JButton more) {
        if (data == null || !data.commentsHasNext()) return;
        more.setEnabled(false);
        more.setText("加载中…");
        Api.async(() -> Api.discussion(number, 50, data.commentsEndCursor()), d -> {
            List<Model.Comment> merged = new ArrayList<>(data.comments());
            merged.addAll(d.comments());
            Model.Discussion nd = new Model.Discussion(data.post(), merged, data.commentTotal(),
                    d.commentsEndCursor(), d.commentsHasNext());
            data = nd;
            collectCommentReactions(d.comments());
            render();
        }, e -> {
            more.setEnabled(true);
            more.setText("加载更多评论");
            Ui.toast("加载失败，请稍后重试");
        });
    }

    /* ---------------- 相关阅读 ---------------- */

    private void loadRelated(Model.Discussion d) {
        final int catId = MetaParser.catIdOf(d.post());
        Api.async(() -> Api.list(24), pageRes -> {
            if (relatedBox == null) return;
            List<Model.Post> picks = new ArrayList<>();
            for (Model.Post p : pageRes.nodes()) {
                if (p.number() == d.post().number()) continue;
                if (catId != 0 && MetaParser.catIdOf(p) == catId) picks.add(p);
                if (picks.size() >= Config.RELATED_COUNT) break;
            }
            if (picks.isEmpty()) {
                for (Model.Post p : pageRes.nodes()) {
                    if (p.number() != d.post().number()) picks.add(p);
                    if (picks.size() >= Config.RELATED_COUNT) break;
                }
            }
            for (Model.Post p : picks) {
                relatedBox.add(relatedCard(p));
                relatedBox.add(Ui.vstrut(10));
            }
            relatedBox.revalidate();
            relatedBox.repaint();
        }, e -> { });
    }

    private JComponent relatedCard(Model.Post p) {
        int catId = MetaParser.catIdOf(p);
        Model.Category cat = MetaParser.catInfo(catId, p.categoryName());
        JPanel card = Ui.card();
        card.setLayout(new BorderLayout(12, 0));
        card.setBorder(new EmptyBorder(10, 12, 10, 14));
        card.setAlignmentX(Component.LEFT_ALIGNMENT);
        card.setMaximumSize(new Dimension(Integer.MAX_VALUE, 88));
        Ui.CoverView thumb = new Ui.CoverView(p.meta(), catId, 8, 20);
        thumb.setPreferredSize(new Dimension(104, 68));
        card.add(thumb, BorderLayout.WEST);
        JPanel box = new JPanel();
        box.setLayout(new BoxLayout(box, BoxLayout.Y_AXIS));
        box.setOpaque(false);
        JLabel t = Ui.inkBold(p.titleOr(), 14);
        t.setAlignmentX(Component.LEFT_ALIGNMENT);
        box.add(t);
        box.add(Ui.vstrut(4));
        JPanel metaRow = Ui.hbox();
        metaRow.setAlignmentX(Component.LEFT_ALIGNMENT);
        metaRow.add(Ui.muted(MetaParser.fmtShort(p.createdAt()) + " ·", 11));
        metaRow.add(Ui.emojiMuted("💬", 11));
        metaRow.add(Ui.muted(String.valueOf(p.commentCount())
                + (MetaParser.isGeneral(catId, cat.name()) ? "" : " · " + cat.name()), 11));
        box.add(metaRow);
        card.add(box, BorderLayout.CENTER);
        card.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        card.addMouseListener(new MouseAdapter() {
            @Override public void mouseClicked(MouseEvent e) { open(p.number()); }
        });
        return Ui.fullWidth(card);
    }
}
