package com.groupblacknet.client.core;

/**
 * 全局配置 —— 与站点 config.js 的 window.BLACKNET 保持一致。
 * 改后端域名时只需改这里。
 */
public final class Config {

    private Config() {}

    /** 数据接口（GitHub Discussions 只读代理） */
    public static final String API = "https://api.blacknet.cc.cd";
    /** GitHub OAuth 代理（登录 / 评论 / 反应 / 顶 / 发帖） */
    public static final String OAUTH = "https://oauth.blacknet.cc.cd";
    /** 图片上传 */
    public static final String UPLOAD = "https://upload.blacknet.cc.cd";
    /** 主站（浏览器打开） */
    public static final String MAIN_SITE = "https://grp.blacknet.cc.cd";

    public static final String DEFAULT_AVATAR =
            "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png";

    /** 列表分页大小（与网页端一致） */
    public static final int PAGE_SIZE = 20;
    /** 首页 Hero 区条数（1 主 + 3 侧） */
    public static final int HERO_COUNT = 4;
    /** 详情页一次拉取的评论数 */
    public static final int COMMENTS_FIRST = 100;
    /** 相关阅读条数 */
    public static final int RELATED_COUNT = 3;

    public static final String APP_NAME = "群档案";
    public static final String APP_SUBTITLE = "Archive";
    public static final String VERSION = "1.0.0";
}
