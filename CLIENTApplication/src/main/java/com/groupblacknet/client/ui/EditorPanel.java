package com.groupblacknet.client.ui;

import com.groupblacknet.client.core.Api;
import com.groupblacknet.client.core.Config;
import com.groupblacknet.client.core.Json;
import com.groupblacknet.client.core.Markdown;
import com.groupblacknet.client.core.MetaParser;
import com.groupblacknet.client.core.Model;
import com.groupblacknet.client.core.Session;
import com.groupblacknet.client.core.Theme;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;
import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.event.DocumentEvent;
import javax.swing.event.DocumentListener;

/**
 * 写稿页：标题 / 分类 / 简介 / 标签 / 封面（图片·文字·无 → tpl 布尔）/ 正文（Markdown 编辑 + 实时预览）。
 * 提交格式与站点 edit.js 完全一致：正文 = 首行 JSON + 空行 + Markdown。
 */
public class EditorPanel extends JPanel {

    private final MainFrame app;
    private final JPanel content = Ui.scrollColumn();
    private final JScrollPane scroll;

    private final JTextField titleField = new JTextField();
    private final JTextArea infoArea = new JTextArea(2, 40);
    private final JTextField tagsField = new JTextField();
    private final JTextArea mdArea = new JTextArea();
    private final JEditorPane preview = new JEditorPane("text/html", "");
    private final JPanel catsRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 8));
    private final JLabel catSrcHint = Ui.muted("", 11);
    private final JLabel titleCount = Ui.muted("0 / 120", 11);
    private final JLabel wordCount = Ui.muted("0 字", 11);
    private final JTextArea jsonPreview = new JTextArea(9, 60);
    private final JLabel coverThumb = new JLabel();
    private final JTextField coverTextField = new JTextField();
    private final JPanel coverTextRow = new JPanel(new BorderLayout(8, 0));
    private final JPanel coverImageRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
    private final JButton publishBtn = Ui.primary("发布文章");
    private final JButton segImage = Ui.primary("图片封面");
    private final JButton segText = Ui.ghost("文字封面");
    private final JButton segNone = Ui.ghost("无封面（模板）");

    private int category = 3;
    private String coverMode = "image";
    private String coverUrl = "";
    private String coverDataUrl = "";
    private boolean busy;

    public EditorPanel(MainFrame app) {
        this.app = app;
        setLayout(new BorderLayout());
        setBackground(Theme.t().bg);
        putClientProperty("gbBg", "bg");
        Ui.themed(this, t -> t.bg);
        content.setBorder(new EmptyBorder(20, 26, 30, 26));
        scroll = Ui.scroll(content);
        add(scroll, BorderLayout.CENTER);
        build();
    }

    /* ---------------- 构建界面 ---------------- */

    private void build() {
        content.removeAll();

        JPanel head = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        head.setOpaque(false);
        head.setAlignmentX(Component.LEFT_ALIGNMENT);
        head.add(Ui.inkBold("写稿", 22));
        head.add(Ui.muted("正文用 Markdown 书写；分类、封面等设置会写入正文首行 JSON", 12));
        content.add(head);
        content.add(Ui.vstrut(16));

        // 标题
        content.add(fieldLabel("标题", titleCount));
        styleText(titleField, 15, false);
        titleField.setMaximumSize(new Dimension(Integer.MAX_VALUE, 42));
        doc(titleField, () -> {
            titleCount.setText(titleField.getText().length() + " / 120");
            refreshJson();
        });
        content.add(titleField);
        content.add(Ui.vstrut(14));

        // 分类
        content.add(fieldLabel("分类", catSrcHint));
        catsRow.setOpaque(false);
        catsRow.setAlignmentX(Component.LEFT_ALIGNMENT);
        content.add(catsRow);
        renderCats();
        content.add(Ui.vstrut(14));

        // 简介
        content.add(fieldLabel("简介", Ui.muted("显示在卡片与 Hero 上（base64 后写入 info）", 11)));
        styleText(infoArea, 13, true);
        JScrollPane infoScroll = new JScrollPane(infoArea);
        infoScroll.setBorder(BorderFactory.createLineBorder(Theme.t().line2));
        infoScroll.setPreferredSize(new Dimension(10, 64));
        infoScroll.setAlignmentX(Component.LEFT_ALIGNMENT);
        content.add(infoScroll);
        content.add(Ui.vstrut(14));

        // 标签
        content.add(fieldLabel("标签", Ui.muted("英文逗号分隔", 11)));
        styleText(tagsField, 13, false);
        tagsField.setMaximumSize(new Dimension(Integer.MAX_VALUE, 38));
        doc(tagsField, this::refreshJson);
        content.add(tagsField);
        content.add(Ui.vstrut(14));

        // 封面
        content.add(fieldLabel("封面", Ui.muted("图片/文字为自定义封面（tpl=false）；无封面则使用分类模板（tpl=true）", 11)));
        JPanel seg = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        seg.setOpaque(false);
        seg.setAlignmentX(Component.LEFT_ALIGNMENT);
        segImage.addActionListener(e -> setCoverMode("image"));
        segText.addActionListener(e -> setCoverMode("text"));
        segNone.addActionListener(e -> setCoverMode("none"));
        seg.add(segImage);
        seg.add(segText);
        seg.add(segNone);
        content.add(seg);
        content.add(Ui.vstrut(10));

        coverImageRow.setOpaque(false);
        coverImageRow.setAlignmentX(Component.LEFT_ALIGNMENT);
        coverThumb.setPreferredSize(new Dimension(180, 110));
        coverThumb.setBorder(BorderFactory.createLineBorder(Theme.t().line2));
        coverThumb.setHorizontalAlignment(SwingConstants.CENTER);
        coverThumb.setText("未选择");
        coverThumb.setForeground(Theme.t().muted);
        JPanel imgActions = new JPanel();
        imgActions.setLayout(new BoxLayout(imgActions, BoxLayout.Y_AXIS));
        imgActions.setOpaque(false);
        JButton pick = Ui.primary("选择并上传图片");
        JButton clear = Ui.ghost("清除");
        pick.addActionListener(e -> pickCover());
        clear.addActionListener(e -> { coverUrl = ""; coverDataUrl = ""; updateCoverThumb(); refreshJson(); });
        JLabel tip = Ui.muted("上传到 upload.blacknet.cc.cd，成功后写入 icon", 11);
        imgActions.add(pick);
        imgActions.add(Ui.vstrut(6));
        imgActions.add(clear);
        imgActions.add(Ui.vstrut(6));
        imgActions.add(tip);
        coverImageRow.add(coverThumb);
        coverImageRow.add(imgActions);
        content.add(coverImageRow);
        content.add(Ui.vstrut(10));

        coverTextRow.setOpaque(false);
        coverTextRow.setAlignmentX(Component.LEFT_ALIGNMENT);
        styleText(coverTextField, 13, false);
        doc(coverTextField, this::refreshJson);
        coverTextRow.add(coverTextField, BorderLayout.CENTER);
        content.add(coverTextRow);

        content.add(Ui.vstrut(14));

        // 正文：编辑 + 预览
        content.add(fieldLabel("正文", wordCount));
        mdArea.setFont(new Font("Consolas", Font.PLAIN, 13));
        mdArea.setLineWrap(true);
        mdArea.setWrapStyleWord(true);
        mdArea.setBackground(Theme.t().bg);
        mdArea.setForeground(Theme.t().ink);
        mdArea.setCaretColor(Theme.t().ink);
        mdArea.setBorder(new EmptyBorder(8, 10, 8, 10));
        mdArea.getDocument().addDocumentListener(new DocumentListener() {
            private void c() {
                wordCount.setText(mdArea.getText().replaceAll("\\s", "").length() + " 字");
                preview.setText(Markdown.toHtml(mdArea.getText()));
            }
            @Override public void insertUpdate(DocumentEvent e) { c(); }
            @Override public void removeUpdate(DocumentEvent e) { c(); }
            @Override public void changedUpdate(DocumentEvent e) { c(); }
        });
        JScrollPane mdScroll = new JScrollPane(mdArea);
        mdScroll.setBorder(BorderFactory.createLineBorder(Theme.t().line2));

        preview.setEditable(false);
        preview.setBackground(Theme.t().bg);
        preview.putClientProperty("gbBg", "bg");
        preview.setMargin(new Insets(10, 12, 10, 12));
        preview.addHyperlinkListener(e -> {
            if (e.getEventType() == javax.swing.event.HyperlinkEvent.EventType.ACTIVATED && e.getURL() != null) {
                Ui.browse(e.getURL().toString());
            }
        });
        JScrollPane pvScroll = new JScrollPane(preview);
        pvScroll.setBorder(BorderFactory.createLineBorder(Theme.t().line2));

        JSplitPane split = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT, mdScroll, pvScroll);
        split.setResizeWeight(0.5);
        split.setDividerSize(6);
        split.setBorder(null);
        split.setPreferredSize(new Dimension(10, 420));
        split.setAlignmentX(Component.LEFT_ALIGNMENT);
        content.add(split);
        content.add(Ui.vstrut(16));

        // 首行 JSON 预览 + 发布
        content.add(fieldLabel("将写入正文首行的 JSON", Ui.muted("与提交内容一致", 11)));
        jsonPreview.setEditable(false);
        jsonPreview.setFont(new Font("Consolas", Font.PLAIN, 12));
        jsonPreview.setBackground(Theme.t().paper2);
        jsonPreview.setForeground(Theme.t().ink2);
        jsonPreview.setBorder(new EmptyBorder(8, 10, 8, 10));
        jsonPreview.setAlignmentX(Component.LEFT_ALIGNMENT);
        content.add(jsonPreview);
        content.add(Ui.vstrut(14));

        JPanel actions = new JPanel(new FlowLayout(FlowLayout.LEFT, 10, 0));
        actions.setOpaque(false);
        actions.setAlignmentX(Component.LEFT_ALIGNMENT);
        publishBtn.addActionListener(e -> publish());
        JButton previewBtn = Ui.ghost("刷新预览");
        previewBtn.addActionListener(e -> preview.setText(Markdown.toHtml(mdArea.getText())));
        actions.add(publishBtn);
        actions.add(previewBtn);
        actions.add(Ui.muted("发布后自动跳转到文章页", 11));
        content.add(actions);

        content.revalidate();
        content.repaint();
        setCoverMode("image");
        refreshJson();
    }

    private JPanel fieldLabel(String label, JComponent right) {
        JPanel row = new JPanel(new BorderLayout());
        row.setOpaque(false);
        row.setAlignmentX(Component.LEFT_ALIGNMENT);
        row.setBorder(new EmptyBorder(0, 0, 6, 0));
        row.add(Ui.inkBold(label, 13), BorderLayout.WEST);
        JPanel r = new JPanel(new FlowLayout(FlowLayout.RIGHT, 0, 0));
        r.setOpaque(false);
        r.add(right);
        row.add(r, BorderLayout.EAST);
        row.setMaximumSize(new Dimension(Integer.MAX_VALUE, 28));
        return row;
    }

    private void styleText(JComponent c, int size, boolean multiline) {
        c.setFont(Ui.font(size));
        c.setBackground(Theme.t().bg);
        c.setForeground(Theme.t().ink);
        if (c instanceof javax.swing.text.JTextComponent tc) tc.setCaretColor(Theme.t().ink);
        c.putClientProperty("gbBg", "bg");
        if (!multiline && c instanceof JTextField tf) {
            tf.setBorder(BorderFactory.createCompoundBorder(
                    BorderFactory.createLineBorder(Theme.t().line2),
                    new EmptyBorder(7, 10, 7, 10)));
        }
    }

    private void doc(JTextField f, Runnable r) {
        f.getDocument().addDocumentListener(new DocumentListener() {
            @Override public void insertUpdate(DocumentEvent e) { r.run(); }
            @Override public void removeUpdate(DocumentEvent e) { r.run(); }
            @Override public void changedUpdate(DocumentEvent e) { r.run(); }
        });
    }

    /* ---------------- 分类 ---------------- */

    public void refreshCategories() {
        renderCats();
    }

    private void renderCats() {
        catsRow.removeAll();
        List<Model.Category> cats = MetaParser.cats();
        boolean has = false;
        for (Model.Category c : cats) if (c.id() == category) has = true;
        if (!has && !cats.isEmpty()) category = cats.get(0).id();

        for (Model.Category c : cats) {
            boolean on = c.id() == category;
            JButton b = on ? Ui.primary(c.name() + " #" + c.id()) : Ui.ghost(c.name() + " #" + c.id());
            b.setFont(Ui.font(12, Font.BOLD));
            b.addActionListener(e -> {
                category = c.id();
                renderCats();
                refreshJson();
            });
            catsRow.add(b);
        }
        catSrcHint.setText("来源：" + (MetaParser.catsFromRemote() ? "CF 存储（KV）" : "内置兜底"));
        catsRow.revalidate();
        catsRow.repaint();
    }

    /* ---------------- 封面 ---------------- */

    private void setCoverMode(String mode) {
        coverMode = mode;
        coverImageRow.setVisible("image".equals(mode));
        coverTextRow.setVisible("text".equals(mode));
        segImage.setText("image".equals(mode) ? "图片封面（已选）" : "图片封面");
        segText.setText("text".equals(mode) ? "文字封面（已选）" : "文字封面");
        segNone.setText("none".equals(mode) ? "无封面 · 模板（已选）" : "无封面 · 模板");
        restyle(segImage, "image".equals(mode));
        restyle(segText, "text".equals(mode));
        restyle(segNone, "none".equals(mode));
        content.revalidate();
        content.repaint();
        refreshJson();
    }

    private void restyle(JButton b, boolean primary) {
        b.setForeground(primary ? Theme.t().onAccent : Theme.t().ink2);
        b.repaint();
    }

    private void pickCover() {
        JFileChooser fc = new JFileChooser();
        fc.setDialogTitle("选择封面图片");
        fc.setFileFilter(new javax.swing.filechooser.FileNameExtensionFilter(
                "图片 (jpg, png, gif, webp, svg, ico)", "jpg", "jpeg", "png", "gif", "webp", "svg", "ico"));
        if (fc.showOpenDialog(this) != JFileChooser.APPROVE_OPTION) return;
        File f = fc.getSelectedFile();
        if (f == null) return;
        if (f.length() > 10L * 1024 * 1024) {
            Ui.alert(this, "图片过大", "封面图片不能超过 10MB。");
            return;
        }
        coverDataUrl = f.toURI().toString();
        updateCoverThumb();
        Ui.toast("正在上传封面…");
        Api.async(() -> Api.upload(f.toPath()), url -> {
            coverUrl = url;
            Ui.toast("封面上传成功");
            refreshJson();
        }, e -> {
            coverUrl = "";
            Ui.alert(this, "上传失败", e.getMessage() == null ? "网络错误" : e.getMessage());
            refreshJson();
        });
    }

    private void updateCoverThumb() {
        String src = !coverUrl.isBlank() ? coverUrl : coverDataUrl;
        if (src == null || src.isBlank()) {
            coverThumb.setIcon(null);
            coverThumb.setText("未选择");
            return;
        }
        if (src.startsWith("file:")) {
            try {
                BufferedImage img = ImageIO.read(new File(java.net.URI.create(src)));
                if (img != null) {
                    coverThumb.setText("");
                    coverThumb.setIcon(new ImageIcon(com.groupblacknet.client.core.ImgCache.cover(img, 180, 110)));
                    return;
                }
            } catch (Exception ignore) { }
        }
        com.groupblacknet.client.core.ImgCache.load(src, 180, 110, true, img -> {
            coverThumb.setText("");
            coverThumb.setIcon(new ImageIcon(img));
        }, () -> {
            coverThumb.setIcon(null);
            coverThumb.setText("图片加载失败");
        });
    }

    /* ---------------- JSON 预览 ---------------- */

    private void refreshJson() {
        String info = infoArea.getText().trim();
        List<String> tags = new ArrayList<>();
        for (String s : tagsField.getText().split(",")) if (!s.trim().isEmpty()) tags.add(s.trim());
        boolean useText = "text".equals(coverMode) && !coverTextField.getText().trim().isEmpty();
        boolean useImg = "image".equals(coverMode) && !(coverUrl.isBlank() && coverDataUrl.isBlank());

        StringBuilder sb = new StringBuilder();
        sb.append("{\n");
        sb.append("  \"info\": ").append(Json.quote(info.isEmpty() ? "" : "<base64 简介 " + info.length() + " 字>")).append(",\n");
        sb.append("  \"icon\": ").append(Json.quote(useImg ? "<base64 图片>" : "")).append(",\n");
        sb.append("  \"coverText\": ")
          .append(Json.quote(useText ? coverTextField.getText().trim() : "")).append(",\n");
        sb.append("  \"category\": ").append(category).append(",\n");
        sb.append("  \"tpl\": ").append("none".equals(coverMode)).append(",\n");
        sb.append("  \"allowComments\": true,\n");
        sb.append("  \"tags\": [");
        for (int i = 0; i < tags.size(); i++) {
            if (i > 0) sb.append(", ");
            sb.append(Json.quote(tags.get(i)));
        }
        sb.append("]\n}");
        jsonPreview.setText(sb.toString());
    }

    /* ---------------- 发布 ---------------- */

    public void reset() {
        titleField.setText("");
        infoArea.setText("");
        tagsField.setText("");
        mdArea.setText("");
        coverTextField.setText("");
        coverUrl = "";
        coverDataUrl = "";
        updateCoverThumb();
        setCoverMode("image");
        renderCats();
        refreshJson();
        SwingUtilities.invokeLater(() -> scroll.getVerticalScrollBar().setValue(0));
    }

    private void publish() {
        if (busy) return;
        if (!Session.loggedIn()) {
            Ui.toast("请先登录");
            app.showHome();
            return;
        }
        String title = titleField.getText().trim();
        if (title.isEmpty()) {
            Ui.toast("请输入标题");
            titleField.requestFocusInWindow();
            return;
        }
        String md = mdArea.getText().trim();
        if (md.isEmpty()) {
            Ui.toast("请输入正文内容");
            mdArea.requestFocusInWindow();
            return;
        }
        String info = infoArea.getText().trim();
        if (info.isEmpty()) info = "无简介";
        List<String> tags = new ArrayList<>();
        for (String s : tagsField.getText().split(",")) if (!s.trim().isEmpty()) tags.add(s.trim());
        String coverText = coverTextField.getText().trim();

        String iconUrl = "";
        if ("image".equals(coverMode)) {
            iconUrl = !coverUrl.isBlank() ? coverUrl : firstImage(md);
        }
        boolean tpl = "none".equals(coverMode);

        String firstLine = "{"
                + Json.quote("info") + ":" + Json.quote(MetaParser.b64e(info)) + ","
                + Json.quote("icon") + ":" + Json.quote(iconUrl.isEmpty() ? "" : MetaParser.b64e(iconUrl)) + ","
                + Json.quote("coverText") + ":" + Json.quote("text".equals(coverMode) ? coverText : "") + ","
                + Json.quote("category") + ":" + category + ","
                + Json.quote("tpl") + ":" + tpl + ","
                + Json.quote("allowComments") + ":true,"
                + Json.quote("tags") + ":["
                + String.join(",", tags.stream().map(Json::quote).toList())
                + "]}";
        String fullBody = firstLine + "\n\n" + md;

        busy = true;
        publishBtn.setEnabled(false);
        publishBtn.setText("发布中…");
        final String body = fullBody;
        Api.async(() -> Api.createDiscussion(title, body), num -> {
            busy = false;
            publishBtn.setEnabled(true);
            publishBtn.setText("发布文章");
            if (num != null && num > 0) {
                Ui.toast("发布成功");
                app.showDetail(num);
            } else {
                Ui.toast("发布成功，但未取得文章号，已返回首页");
                app.showHome();
            }
        }, e -> {
            busy = false;
            publishBtn.setEnabled(true);
            publishBtn.setText("发布文章");
            Ui.alert(this, "发布失败", e.getMessage() == null ? "网络错误，请稍后重试" : e.getMessage());
        });
    }

    private String firstImage(String md) {
        if (md == null || md.isBlank()) return "";
        var m = java.util.regex.Pattern.compile("!\\[.*?\\]\\((.*?)\\)").matcher(md);
        if (m.find()) return m.group(1);
        m = java.util.regex.Pattern.compile("<img[^>]+src=[\"']([^\"']+)[\"']", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(md);
        if (m.find()) return m.group(1);
        m = java.util.regex.Pattern.compile("(https?://[^\\s]+\\.(?:png|jpg|jpeg|gif|svg|webp))", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(md);
        return m.find() ? m.group(1) : "";
    }
}
