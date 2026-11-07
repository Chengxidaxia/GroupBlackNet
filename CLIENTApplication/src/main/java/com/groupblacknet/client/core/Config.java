package com.groupblacknet.client.core;

/**
 * 全局配置 —— 与站点 config.js 的 window.BLACKNET 保持一致。
 * 改后端域名时只需改这里。
 */
public final class Config {

    private Config() {}

    /**
     * 数据接口（GitHub Discussions 只读代理）。
     *
     * 2026-11-07 起改走站点自身的 Vercel Function：CF Worker（api/oauth/upload 三个子域）
     * 已全线返回 530 Origin DNS error，彻底不可用。站点同源路径由 netlify/functions 提供，
     * 支持同样的 ?first= / ?d= / ?after= / ?cafter= 参数，返回结构也一致。
     */
    public static final String API = "https://grp.blacknet.cc.cd/api/discussions";
    /** GitHub OAuth 代理（登录 / 评论 / 反应 / 顶 / 发帖）—— Vercel Function，同源 /api/oauth */
    public static final String OAUTH = "https://grp.blacknet.cc.cd/api/oauth";
    /** 图片上传 —— 主站没有上传 Function，用书阁的 /api/imgup（转发 pixhost） */
    public static final String UPLOAD = "https://book.blacknet.cc.cd/api/imgup";
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
    public static final String VERSION = "1.0.2";
}
