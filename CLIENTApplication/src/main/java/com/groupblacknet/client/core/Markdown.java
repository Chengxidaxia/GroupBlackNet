package com.groupblacknet.client.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Markdown → 受限 HTML（Swing 的 JEditorPane 只支持 HTML 3.2 子集）。
 * 覆盖站点正文常用语法：标题、粗斜、删除线、行内/块级代码、引用、有序无序列表、
 * 表格、分割线、链接、图片（降级为链接）、@提及、#编号。
 */
public final class Markdown {

    private Markdown() {}

    public static String toHtml(String md) {
        if (md == null) return "";
        Theme.Tokens t = Theme.t();
        String ink = hex(t.ink), ink2 = hex(t.ink2), muted = hex(t.muted);
        String accent = hex(t.accent), paper2 = hex(t.paper2), lineCol = hex(t.line);
        String mono = "Consolas,Monaco,'Courier New',monospace";
        String sans = "Microsoft YaHei,PingFang SC,Segoe UI,sans-serif";

        StringBuilder out = new StringBuilder();
        out.append("<html><body style=\"font-family:").append(sans)
           .append(";font-size:14px;color:").append(ink).append(";margin:0;padding:0\">");

        String[] lines = md.replace("\r\n", "\n").replace('\r', '\n').split("\n", -1);
        boolean inCode = false, inUl = false, inOl = false, inQuote = false;
        StringBuilder codeBuf = new StringBuilder();
        StringBuilder para = new StringBuilder();
        List<String> tableRows = new ArrayList<>();

        for (int i = 0; i < lines.length; i++) {
            String raw = lines[i];
            String line = raw.trim();

            // 代码块
            if (line.startsWith("```")) {
                if (!inCode) { flushPara(out, para); inCode = true; codeBuf.setLength(0); }
                else {
                    out.append("<pre style=\"background:").append(paper2).append(";border:1px solid ").append(line)
                       .append(";padding:10px;font-family:").append(mono).append(";font-size:13px;color:")
                       .append(ink2).append("\">").append(esc(codeBuf.toString())).append("</pre>");
                    inCode = false;
                }
                continue;
            }
            if (inCode) { codeBuf.append(raw).append('\n'); continue; }

            // 表格（简单两段式：表头 + 分隔行）
            if (line.startsWith("|") && line.endsWith("|")) { tableRows.add(line); continue; }
            else if (!tableRows.isEmpty()) { out.append(renderTable(tableRows, t, mono, ink2, paper2, lineCol)); tableRows.clear(); }

            // 分割线
            if (line.matches("^(-{3,}|\\*{3,}|_{3,})$")) {
                flushPara(out, para); closeLists(out, inUl, inOl); inUl = inOl = false;
                out.append("<hr style=\"border:none;border-top:1px solid ").append(lineCol).append("\">");
                continue;
            }

            // 标题
            Matcher h = Pattern.compile("^(#{1,6})\\s+(.*)$").matcher(line);
            if (h.matches()) {
                flushPara(out, para); closeLists(out, inUl, inOl); inUl = inOl = false;
                int lv = h.group(1).length();
                int size = switch (lv) { case 1 -> 24; case 2 -> 21; case 3 -> 18; case 4 -> 16; default -> 15; };
                out.append("<div style=\"font-size:").append(size)
                   .append("px;font-weight:bold;color:").append(ink)
                   .append(";margin:18px 0 8px\">").append(inline(h.group(2), t, mono)).append("</div>");
                continue;
            }

            // 引用
            if (line.startsWith(">")) {
                flushPara(out, para);
                out.append("<div style=\"border-left:3px solid ").append(accent)
                   .append(";background:").append(paper2).append(";padding:8px 12px;margin:8px 0;color:")
                   .append(ink2).append("\">").append(inline(line.substring(1).trim(), t, mono)).append("</div>");
                continue;
            }

            // 无序列表
            Matcher ul = Pattern.compile("^[-*+]\\s+(.*)$").matcher(line);
            if (ul.matches()) {
                flushPara(out, para);
                if (inOl) { out.append("</ol>"); inOl = false; }
                if (!inUl) { out.append("<ul style=\"margin:6px 0 6px 18px;padding:0\">"); inUl = true; }
                out.append("<li style=\"margin:3px 0\">").append(inline(ul.group(1), t, mono)).append("</li>");
                continue;
            }

            // 有序列表
            Matcher ol = Pattern.compile("^\\d+[.)]\\s+(.*)$").matcher(line);
            if (ol.matches()) {
                flushPara(out, para);
                if (inUl) { out.append("</ul>"); inUl = false; }
                if (!inOl) { out.append("<ol style=\"margin:6px 0 6px 18px;padding:0\">"); inOl = true; }
                out.append("<li style=\"margin:3px 0\">").append(inline(ol.group(1), t, mono)).append("</li>");
                continue;
            }

            // 空行 → 段落/列表收尾
            if (line.isEmpty()) {
                flushPara(out, para);
                closeLists(out, inUl, inOl); inUl = inOl = false;
                inQuote = false;
                continue;
            }

            // 普通段落
            if (inUl || inOl) { closeLists(out, inUl, inOl); inUl = inOl = false; }
            if (para.length() > 0) para.append("<br>");
            para.append(inline(line, t, mono));
        }

        if (inCode && codeBuf.length() > 0) {
            out.append("<pre style=\"background:").append(paper2).append(";padding:10px;font-family:")
               .append(mono).append("\">").append(esc(codeBuf.toString())).append("</pre>");
        }
        if (!tableRows.isEmpty()) out.append(renderTable(tableRows, t, mono, ink2, paper2, lineCol));
        flushPara(out, para);
        closeLists(out, inUl, inOl);
        out.append("</body></html>");
        return out.toString();
    }

    private static void flushPara(StringBuilder out, StringBuilder para) {
        if (para.length() == 0) return;
        out.append("<div style=\"margin:8px 0;line-height:1.75\">").append(para).append("</div>");
        para.setLength(0);
    }

    private static void closeLists(StringBuilder out, boolean ul, boolean ol) {
        if (ul) out.append("</ul>");
        if (ol) out.append("</ol>");
    }

    private static String renderTable(List<String> rows, Theme.Tokens t, String mono,
                                      String ink2, String paper2, String lineCol) {
        if (rows.isEmpty()) return "";
        StringBuilder sb = new StringBuilder("<table cellspacing=\"0\" cellpadding=\"6\" style=\"border-collapse:collapse;margin:8px 0;font-size:13px\">");
        for (int r = 0; r < rows.size(); r++) {
            String row = rows.get(r);
            if (row.matches("^\\|[\\s|:-]+\\|$")) continue;   // 分隔行
            String[] cells = row.substring(1, row.length() - 1).split("\\|");
            sb.append("<tr>");
            for (String c : cells) {
                String style = "border:1px solid " + lineCol + ";padding:5px 8px;"
                        + (r == 0 ? "background:" + paper2 + ";font-weight:bold;color:" + ink2 + ";" : "");
                sb.append("<td style=\"").append(style).append("\">")
                  .append(inline(c.trim(), t, mono)).append("</td>");
            }
            sb.append("</tr>");
        }
        return sb.append("</table>").toString();
    }

    /* ---------------- 行内元素 ---------------- */

    private static final Pattern INLINE_LINK = Pattern.compile("\\[([^\\]]*)\\]\\(([^)\\s]+)\\)");
    private static final Pattern INLINE_IMG = Pattern.compile("!\\[([^\\]]*)\\]\\(([^)\\s]+)\\)");
    private static final Map<String, String> PH = new LinkedHashMap<>();

    /** 行内 Markdown → HTML（先转义，再做替换，避免注入）。 */
    private static String inline(String s, Theme.Tokens t, String mono) {
        if (s == null) return "";
        String x = esc(s);

        // 图片：JEditorPane 不便内嵌外链图片 → 降级为链接样式
        Matcher im = INLINE_IMG.matcher(x);
        StringBuffer sb = new StringBuffer();
        while (im.find()) {
            String alt = im.group(1), url = im.group(2);
            im.appendReplacement(sb, Matcher.quoteReplacement(
                    "<a href=\"" + url + "\" style=\"color:" + hex(t.accent) + "\">[图片] " + (alt.isBlank() ? url : alt) + "</a>"));
        }
        im.appendTail(sb);
        x = sb.toString();

        // 链接
        Matcher lm = INLINE_LINK.matcher(x);
        sb = new StringBuffer();
        while (lm.find()) {
            String text = lm.group(1), url = lm.group(2);
            lm.appendReplacement(sb, Matcher.quoteReplacement(
                    "<a href=\"" + url + "\" style=\"color:" + hex(t.accent) + "\">" + (text.isBlank() ? url : text) + "</a>"));
        }
        lm.appendTail(sb);
        x = sb.toString();

        // 行内代码（先占位，避免内部内容被其它规则改写）
        PH.clear();
        x = replaceCode(x, t, mono);

        // 粗 / 斜 / 删除线
        x = x.replaceAll("\\*\\*(.+?)\\*\\*", "<b>$1</b>");
        x = x.replaceAll("__([^_]+)__", "<b>$1</b>");
        x = x.replaceAll("(?<!\\*)\\*([^*]+)\\*(?!\\*)", "<i>$1</i>");
        x = x.replaceAll("~~(.+?)~~", "<strike>$1</strike>");
        x = x.replaceAll("&lt;(https?://[^\\s&]+)&gt;", "<a href=\"$1\" style=\"color:" + hex(t.accent) + "\">$1</a>");

        // @提及 / #编号（站内约定，做视觉强调）
        x = x.replaceAll("(@[A-Za-z0-9_-]{1,39})",
                "<span style=\"color:" + hex(t.accent) + ";font-weight:bold\">$1</span>");
        x = x.replaceAll("(#[0-9]{1,6})",
                "<span style=\"color:" + hex(t.accent) + ";font-weight:bold\">$1</span>");

        // 还原行内代码
        for (Map.Entry<String, String> e : PH.entrySet()) x = x.replace(e.getKey(), e.getValue());
        return x;
    }

    private static String replaceCode(String x, Theme.Tokens t, String mono) {
        Matcher m = Pattern.compile("`([^`]+)`").matcher(x);
        StringBuffer sb = new StringBuffer();
        int i = 0;
        while (m.find()) {
            String key = "\u0000CODE" + (i++) + "\u0000";
            PH.put(key, "<code style=\"font-family:" + mono + ";background:" + hex(t.paper2)
                    + ";padding:1px 4px\">" + m.group(1) + "</code>");
            m.appendReplacement(sb, Matcher.quoteReplacement(key));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    /* ---------------- 纯文本摘要 ---------------- */

    /** 去掉 Markdown 标记，取纯文本（用于列表摘要）。 */
    public static String plain(String md, int limit) {
        if (md == null) return "";
        String s = md.replaceAll("```[\\s\\S]*?```", " ")
                .replaceAll("`([^`]*)`", "$1")
                .replaceAll("!\\[([^\\]]*)\\]\\([^)]*\\)", "$1")
                .replaceAll("\\[([^\\]]*)\\]\\([^)]*\\)", "$1")
                .replaceAll("(?m)^\\s{0,3}#{1,6}\\s*", "")
                .replaceAll("(?m)^\\s{0,3}>\\s?", "")
                .replaceAll("(?m)^\\s{0,3}[-*+]\\s+", "")
                .replaceAll("[*_~]", "")
                .replaceAll("\\s+", " ")
                .trim();
        if (limit > 0 && s.length() > limit) s = s.substring(0, limit) + "…";
        return s;
    }

    public static String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
    }

    public static String hex(java.awt.Color c) {
        return String.format("#%02x%02x%02x", c.getRed(), c.getGreen(), c.getBlue());
    }
}
