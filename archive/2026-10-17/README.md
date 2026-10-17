# 无限互动小说作家 · 冻结归档

2026-10-17，用户认可当前整体版本，明确要求形成在线链接，以后从个人品牌网站跳转，并正式归档、不再改动。当前剧情、界面和依赖按现状冻结；本轮仅补发布配置、绑定和归档记录。

## 在线入口

- 固定链接：[无限互动小说作家](https://novel-archive-20261017.vercel.app/)。
- 云端不可变部署：`dpl_52NJq7tfcSntfkaP1EjPBqRe6zes`，Vercel 项目 `novel-generate`，Preview 构建状态 READY。
- 平台访问保护覆盖 all，访客须登录获授权的 Vercel 账号。当前为受保护体验入口；本轮没有把它开放为匿名创作站。
- 页面匿名访问实际进入 Vercel 登录页。浏览器没有该平台登录会话，本轮没有完成保护内的线上注册、模型生成或续写验收；不把 READY 当作这些功能均已线上验证。
- 原项目的旧域名与生产部署没有切换到本次版本；请以后接入时使用上方固定链接。

## 品牌网站接入

在品牌网站的项目卡片上添加普通链接即可：

```html
<a href="https://novel-archive-20261017.vercel.app/" target="_blank" rel="noopener noreferrer">体验互动小说</a>
```

本轮未修改个人品牌网站。链接指向独立应用，不需要把本项目源码、后端或环境变量放进品牌站。以后若要求免 Vercel 登录向访客开放，应单独授权发布范围；当前账号持久化、权限及用量限制的原门禁仍保留，不能仅移除平台保护后当作公众服务。

## 冻结与恢复

- 本地 Git 标签：`novel-archive-20261017`；精确提交以标签与本地归档 manifest 为准。
- 集中恢复产物在项目根 `output/archives/novel-freeze-2026-10-17/`，不进入公开部署。
- `project-sources.tar.gz` 保存根目录旧版、当前 web 源码、静态资源及项目记录；`source-manifest.json` 保存逐文件 SHA-256。
- `web-history.bundle` 保存本地 web 仓库历史与冻结标签。旧历史含旧提交身份信息，仅作本地恢复，不公开上传。
- `deploy-source.tar.gz` 保存本轮实际发布所用运行源码、lockfile 和发布配置；没有 `.env.local`、平台认证资料或 node_modules。
- `evidence/` 与日志保存本次和必要历史验证证据。浏览器作品、账号及个人存档不属于源码备份，没有读取或打包。

只恢复源码：先在新目录解压 `project-sources.tar.gz`，按 manifest 核验，再进入 `web/` 执行 `npm ci`。需要 Git 历史时，单独从 bundle 克隆 web 仓库，检查出冻结标签；不要向原目录执行强制 reset。

部署所需私密配置继续留在原本机环境文件和 Vercel 环境变量中，不进入恢复包。恢复到新环境时配置服务端 `SILICONFLOW_API_KEY`、长度合格的 `JWT_SECRET`；本次浏览器构建覆盖 `NEXT_PUBLIC_CLOUDBASE_ENV_ID` 和旧 `NEXT_PUBLIC_SILICONFLOW_API_KEY` 为空，保留当前浏览器本地保存模式，不启用未验收的云库分支。不得将模型密钥配置为公开客户端变量。AI 函数时长由 `vercel.json` 设为120秒，以覆盖现有60秒上游超时。

重新发布示例（原项目绑定已修正，命令需从 web 或恢复后的部署包执行）：

```sh
vercel deploy --yes --build-env NEXT_PUBLIC_CLOUDBASE_ENV_ID= --build-env NEXT_PUBLIC_SILICONFLOW_API_KEY= --env NEXT_PUBLIC_CLOUDBASE_ENV_ID= --env NEXT_PUBLIC_SILICONFLOW_API_KEY=
```

该命令仅供将来明确要求恢复时使用；归档后不持续开发、不追加自动测试、不自动重新部署。

## 本轮验证与原有边界

归档前重新运行81项自动化测试和26组实际组件流程检查，全部通过；云端安装、生产构建及部署完成。此前真实模型混合选项从第3节连续9次保存到第12节完结、修发电机当节获密钥等范围，以[剧情修复记录](../../剧情推进与节数回退修复_2026-10-16.md)为准，本轮不追加长程模型测试。

账号仍为服务端内存存储；重新登录/资料、云授权、存储异常、费用和会员/封面等原问题按[全功能记录](../../全功能实测与剧情推进验收_2026-10-15.md)和[对抗性审查](../../对抗性审查报告_2026-10-15.md)冻结保留。Next.js仍为当前14.2.3，云构建成功不等于后续安全或依赖维护保证。用户认可与归档确认不把这些事项改成已完成。

源码、恢复包和原目录保留；没有推送GitHub或变更品牌站内容。后续仅在用户明确要求时处理链接接入、运行维护或另立变更范围。
