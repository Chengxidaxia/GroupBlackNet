package com.groupblacknet.client.ui;

import com.groupblacknet.client.core.Config;
import com.groupblacknet.client.core.Theme;

import java.awt.*;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Consumer;

import javax.swing.*;
import javax.swing.border.EmptyBorder;

/**
 * 关于 / 联系：内容与站点 about.html、contact.html 对齐。
 */
public final class AboutPanel extends JPanel {

    public AboutPanel(MainFrame app) {
        setLayout(new BorderLayout());
        setBackground(Theme.t().bg);
        putClientProperty("gbBg", "bg");
        Ui.themed(this, t -> t.bg);

        JPanel col = Ui.scrollColumn();
        col.setBorder(new EmptyBorder(28, 40, 40, 40));

        col.add(Ui.muted("首页 / 关于", 12));
        col.add(Ui.vstrut(10));
        col.add(Ui.inkBold("关于群档案", 26));
        col.add(Ui.vstrut(6));
        col.add(Ui.accent("记录、连接，然后被更多人读到。", 14));
        col.add(Ui.vstrut(16));
        col.add(paragraph("「群档案」是一个群内消息的归档站。我们把群里那些容易沉底、却又值得留下的讨论，"
                + "整理成一条条结构化记录，让它们在几天、几个月之后依然能被找到、被回看。"));
        col.add(section("我们为什么做这个",
                "群聊里每天都在产生有价值的碎片，但它们的生命周期太短了 —— 一条认真写下的分享，"
                        + "往往在几十条新消息之后就被冲到看不见的地方。群档案想做的，是给这些内容一个更长的保质期。"));
        col.add(section("内容怎么组织",
                "每篇文章 = 一条讨论记录：标题 + 简介 + 正文 + 分类 + 标签\n"
                        + "分类、标签、是否允许评论等设置，都写在正文首行的元数据里\n"
                        + "正文使用 Markdown 书写，支持 @提及 与 #编号 互相引用\n"
                        + "支持点赞（顶）与多表情反应，也支持带嵌套回复的评论"));
        col.add(section("技术上是怎样的",
                "内容源：GitHub Discussions（内容与讨论都沉淀在开源仓库里，可追溯、可迁移）\n"
                        + "数据接口：Cloudflare Workers 提供的只读 / 写入代理\n"
                        + "登录方式：GitHub OAuth，登录后才能写稿、评论与点赞\n"
                        + "编辑器：网页端为 Vditor 4.0；本客户端为 Markdown 编辑 + 实时预览\n"
                        + "站点托管：GitHub Pages，纯静态，不依赖任何数据库"));
        col.add(section("参与方式",
                "如果你也想把群里的讨论整理下来，可以直接在开源仓库的讨论区发帖，或登录本站在线投稿。"));
        col.add(Ui.vstrut(8));

        JPanel links = new JPanel(new FlowLayout(FlowLayout.LEFT, 14, 6));
        links.setOpaque(false);
        links.setAlignmentX(Component.LEFT_ALIGNMENT);
        links.add(Ui.link("▸ 主站 " + Config.MAIN_SITE, Config.MAIN_SITE));
        links.add(Ui.link("▸ 开源仓库", "https://github.com/Chengxidaxia/GroupBlackNet"));
        links.add(Ui.link("▸ 讨论区", "https://github.com/Chengxidaxia/GroupBlackNet/discussions"));
        col.add(links);
        col.add(Ui.vstrut(10));
        col.add(Ui.muted("客户端版本 v" + Config.VERSION + " · 由 JDK 21 + Swing 构建", 11));

        add(Ui.scroll(col), BorderLayout.CENTER);
    }

    static JLabel paragraph(String text) {
        JLabel l = Ui.ink2("<html><body style='width:760px;line-height:1.8'>" + wrap(text) + "</body></html>", 13);
        l.setAlignmentX(Component.LEFT_ALIGNMENT);
        return l;
    }

    static JPanel section(String title, String body) {
        JPanel box = Ui.column();
        box.setOpaque(false);
        box.setAlignmentX(Component.LEFT_ALIGNMENT);
        box.add(Ui.vstrut(14));
        box.add(Ui.inkBold(title, 16));
        box.add(Ui.vstrut(6));
        for (String line : body.split("\n")) {
            JLabel l = Ui.ink2(line, 13);
            l.setAlignmentX(Component.LEFT_ALIGNMENT);
            box.add(l);
            box.add(Ui.vstrut(4));
        }
        return box;
    }

    static String wrap(String s) {
        return com.groupblacknet.client.core.Markdown.esc(s);
    }
}

/** 联系页 */
final class ContactPanel extends JPanel {

    ContactPanel(MainFrame app) {
        setLayout(new BorderLayout());
        setBackground(Theme.t().bg);
        putClientProperty("gbBg", "bg");
        Ui.themed(this, t -> t.bg);

        JPanel col = Ui.scrollColumn();
        col.setBorder(new EmptyBorder(28, 40, 40, 40));
        col.add(Ui.muted("首页 / 联系", 12));
        col.add(Ui.vstrut(10));
        col.add(Ui.inkBold("联系我们", 26));
        col.add(Ui.vstrut(6));
        col.add(Ui.accent("投稿、反馈、纠错，或者只是聊聊。", 14));
        col.add(Ui.vstrut(18));

        col.add(Ui.inkBold("联系方式", 16));
        col.add(Ui.vstrut(8));
        Map<String, String> rows = new LinkedHashMap<>();
        rows.put("邮箱", "chengxidaxia@outlook.com");
        rows.put("仓库", "Chengxidaxia/GroupBlackNet");
        rows.put("讨论区", "GitHub Discussions（推荐，投稿即发布）");
        for (Map.Entry<String, String> e : rows.entrySet()) {
            JPanel row = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 2));
            row.setOpaque(false);
            row.setAlignmentX(Component.LEFT_ALIGNMENT);
            row.add(Ui.muted(e.getKey() + "：", 13));
            row.add(Ui.ink2(e.getValue(), 13));
            col.add(row);
        }
        JPanel linkRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 14, 2));
        linkRow.setOpaque(false);
        linkRow.setAlignmentX(Component.LEFT_ALIGNMENT);
        linkRow.add(Ui.link("写封邮件", "mailto:chengxidaxia@outlook.com"));
        linkRow.add(Ui.link("打开讨论区", "https://github.com/Chengxidaxia/GroupBlackNet/discussions"));
        col.add(linkRow);

        col.add(AboutPanel.section("开放投稿时间",
                "平时：星期六 & 星期日 8:00 ~ 20:00\n节假日：9:00 ~ 21:00\n审稿：10:00 ~ 18:00"));
        col.add(AboutPanel.section("怎么投稿",
                "在线投稿：登录本站后点右上角「写稿」，写完直接发布（需要 GitHub 账号）。\n"
                        + "邮件投稿：把标题与正文发到上面的邮箱。\n"
                        + "讨论区投稿：直接在原仓库的 Discussions 里发帖，会自动同步到本站。"));
        col.add(AboutPanel.section("反馈与纠错",
                "发现内容有误、排版异常或功能问题，欢迎发邮件或在仓库提 Issue。我们会尽快处理。"));

        add(Ui.scroll(col), BorderLayout.CENTER);
    }
}
