package com.groupblacknet.client;

import com.groupblacknet.client.core.Config;
import com.groupblacknet.client.core.Session;
import com.groupblacknet.client.core.Theme;
import com.groupblacknet.client.ui.MainFrame;

import java.awt.Font;

import javax.swing.SwingUtilities;
import javax.swing.UIManager;

/**
 * 群档案 · 桌面客户端（JDK 21 + Swing，零第三方依赖）。
 *
 * 功能对齐网页端：
 *   · 首页：公告置顶 Hero、分类筛选、排序（默认/创建/修改/点赞）、升序、搜索、分页、公告条
 *   · 详情：封面（tpl 裁定规则）、Markdown 正文、顶与多表情反应、评论与嵌套回复、相关阅读
 *   · 写稿：标题/分类/简介/标签/封面（图片·文字·无 tpl）/ Markdown 编辑与预览 / 发布
 *   · 登录：GitHub Device Flow 或手动令牌（与网页端共用 github_token 鉴权）
 *   · 主题：默认亮色，可切暗色并持久化
 */
public final class App {

    public static void main(String[] args) {
        Theme.load();
        Session.load();
        installLookAndFeel();

        String page = null;
        int d = 0;
        for (String a : args) {
            if (a.startsWith("--page=")) page = a.substring("--page=".length());
            else if (a.startsWith("--d=")) {
                try { d = Integer.parseInt(a.substring("--d=".length()).trim()); }
                catch (NumberFormatException ignore) { }
            } else if (a.startsWith("--theme=")) {
                Theme.set("dark".equalsIgnoreCase(a.substring("--theme=".length()).trim())
                        ? Theme.Mode.DARK : Theme.Mode.LIGHT);
            }
        }

        final String startPage = page;
        final int startD = d;
        SwingUtilities.invokeLater(() -> {
            MainFrame frame = new MainFrame();
            frame.setVisible(true);
            frame.openPage(startPage, startD);
        });
    }

    /** 让内置组件（菜单、提示、文件选择器）与主题协调。 */
    private static void installLookAndFeel() {
        try {
            UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
        } catch (Exception ignore) { }

        Font base = new Font("Microsoft YaHei", Font.PLAIN, 13);
        String[] keys = {
                "Label.font", "Button.font", "TextField.font", "TextArea.font", "ComboBox.font",
                "CheckBox.font", "RadioButton.font", "Menu.font", "MenuItem.font", "PopupMenu.font",
                "ToolTip.font", "List.font", "Table.font", "Tree.font", "OptionPane.messageFont",
                "OptionPane.buttonFont", "FileChooser.font", "TitledBorder.font", "CheckBoxMenuItem.font"
        };
        for (String k : keys) UIManager.put(k, base);

        Theme.Tokens t = Theme.t();
        UIManager.put("ToolTip.background", t.paper2);
        UIManager.put("ToolTip.foreground", t.ink);
        UIManager.put("Panel.background", t.bg);
        UIManager.put("OptionPane.background", t.paper);
        UIManager.put("OptionPane.messageForeground", t.ink);
        UIManager.put("MenuItem.background", t.paper);
        UIManager.put("MenuItem.foreground", t.ink);
        UIManager.put("PopupMenu.background", t.paper);
        UIManager.put("Menu.selectionBackground", t.accentSoft);
        UIManager.put("MenuItem.selectionBackground", t.accentSoft);
        UIManager.put("MenuItem.selectionForeground", t.ink);
        UIManager.put("SplitPane.background", t.bg);
        UIManager.put("SplitPaneDivider.background", t.line);
        UIManager.put("ScrollBar.thumb", t.line2);
        UIManager.put("ScrollBar.track", t.paper);

        System.out.println("群档案客户端 v" + Config.VERSION + " · 主题：" + (Theme.isDark() ? "暗色" : "亮色"));
    }
}
