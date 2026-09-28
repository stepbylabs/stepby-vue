# -*- coding: utf-8 -*-
"""将 i18n 大文件按顶层模块拆分为分类目录文件。

- 保留每个模块的原始文本（含注释/尾逗号），机械切分，绝不改写文案
- 分类映射：common / auth / dashboard / system / monitor / tool / error / route / time / stepby
- 每个分类文件是合法 TS 模块：`export default { ... }`（可被 index.ts import）
- <locale>/index.ts 按分类顺序 spread 聚合导出，合并对象与拆分前内容完全一致
- 校验：
  1) 模块数 == 85、无重复、分类映射全覆盖
  2) 重建对象字面量逐块文本与原文件完全一致（多重集比对，防止丢块/串块/文本损坏）
- 成功校验后删除旧单文件（避免 `./locales/zh-CN` 同时命中 .ts 与 /index.ts 的解析歧义）

用法：python scripts/split_i18n.py
"""
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src" / "i18n" / "locales"
OLD_ZH = SRC / "zh-CN.ts"
OLD_EN = SRC / "en-US.ts"

CATEGORY_ORDER = [
    "common", "auth", "dashboard", "system", "monitor",
    "tool", "error", "route", "time", "stepby",
]

CATEGORY_LABEL = {
    "common": "通用基础",
    "auth": "认证会话",
    "dashboard": "首页工作台",
    "system": "系统管理",
    "monitor": "系统监控",
    "tool": "系统工具",
    "error": "错误与反馈",
    "route": "路由导航",
    "time": "时间日期",
    "stepby": "品牌",
}

CATEGORY_MAP = {
    # common 通用基础
    "common": "common", "editableCell": "common", "theme": "common", "themeEditor": "common",
    "layout": "common", "breadcrumb": "common", "hamburger": "common", "headerSearch": "common",
    "iconSelect": "common", "langSelect": "common", "sizeSelect": "common", "rightToolbar": "common",
    # auth 认证会话
    "login": "auth", "register": "auth", "oauth": "auth", "session": "auth", "lock": "auth",
    "myLogin": "auth", "mySession": "auth", "passwordRule": "auth", "passwordStrength": "auth",
    "cookieConsent": "auth", "legal": "auth",
    # dashboard 首页工作台
    "dashboard": "dashboard", "workbench": "dashboard", "auditDashboard": "dashboard",
    "announcementBanner": "dashboard",
    # system 系统管理
    "user": "system", "userAuthRole": "system", "userPrefs": "system", "userView": "system",
    "role": "system", "dept": "system", "post": "system", "dict": "system", "config": "system",
    "menu": "system", "menuModule": "system", "notice": "system", "noticeCenter": "system",
    "msg": "system", "task": "system", "backup": "system", "rateLimit": "system", "report": "system",
    "profile": "system",
    # monitor 系统监控
    "operlog": "monitor", "logininfor": "monitor", "online": "monitor", "job": "monitor",
    "jobLog": "monitor", "cache": "monitor", "health": "monitor", "observability": "monitor",
    "logTail": "monitor", "ipLocation": "monitor", "desensitize": "monitor",
    # tool 系统工具
    "gen": "tool", "build": "tool", "treePanel": "tool", "excelImport": "tool",
    "exportDialog": "tool", "file": "tool", "fileUpload": "tool", "imageUpload": "tool",
    "pdf": "tool", "printTable": "tool", "editor": "tool", "httpDebug": "tool",
    "crontab": "tool", "taskProgress": "tool", "shortcuts": "tool",
    # error 错误与反馈
    "error": "error", "errorBoundary": "error", "errorCode": "error", "notification": "error",
    "about": "error", "changelog": "error", "tour": "error", "commandPalette": "error", "help": "error",
    # route 路由导航
    "route": "route", "batchActions": "route",
    # time 时间日期
    "time": "time",
    # stepby 品牌
    "stepby": "stepby",
}

# 顶层模块匹配：2 空格缩进的 `name: {`
MODULE_RE = re.compile(r"(?m)^  ([a-zA-Z0-9_]+): \{")


def split_modules(text: str):
    """返回 [(name, block_text)]。block 为模块原始文本（含 2 空格缩进与收尾逗号）。"""
    matches = list(MODULE_RE.finditer(text))
    blocks = []
    for i, m in enumerate(matches):
        name = m.group(1)
        start = m.start()
        if i + 1 < len(matches):
            end = matches[i + 1].start()
        else:
            # 最后一个模块：其内容到文件收尾 "}" 前
            tail = text.rstrip("\n")
            assert tail.endswith("}"), "文件应以 '}' 结尾"
            end = tail.rfind("\n}")
        blocks.append((name, text[start:end]))
    return blocks


def build(locale_file: Path, locale: str):
    text = locale_file.read_text(encoding="utf-8")
    assert text.lstrip().startswith("export default {"), f"[{locale}] 应以 `export default {{` 开头"

    blocks = split_modules(text)
    names = [n for n, _ in blocks]
    assert len(names) == len(set(names)), f"[{locale}] 存在重复模块名"
    assert len(names) == 85, f"[{locale}] 期望 85 个模块，实际 {len(names)}"

    unmapped = [n for n in names if n not in CATEGORY_MAP]
    assert not unmapped, f"[{locale}] 未映射模块 {unmapped}"

    # 按分类分组（保持模块在原始文件中的相对顺序）
    grouped: dict[str, list[tuple[str, str]]] = {}
    for name, block in blocks:
        grouped.setdefault(CATEGORY_MAP[name], []).append((name, block))

    out_dir = SRC / locale
    out_dir.mkdir(exist_ok=True)
    for f in out_dir.glob("*.ts"):
        f.unlink()

    for cat in CATEGORY_ORDER:
        mods = grouped.get(cat, [])
        # 每个块去掉尾随空白后以单个换行连接，避免模块间出现多余空行
        body = "\n".join(block.rstrip() for _, block in mods)
        lines = [
            f"// {locale} · 分类：{cat}（{CATEGORY_LABEL[cat]}）",
            "// 本文件由 split_i18n.py 生成，勿手工编辑；新增文案请改对应模块块",
            "",
            "export default {",
            body,
            "}",
            "",
        ]
        (out_dir / f"{cat}.ts").write_text("\n".join(lines), encoding="utf-8")
        print(f"[{locale}] {cat}.ts: {len(mods)} modules")

    # index.ts：按 CATEGORY_ORDER 顺序 spread 合并
    idx_lines = [
        f"// {locale} 语言包 —— 按模块拆分聚合导出",
        "// 本文件由 split_i18n.py 生成，勿手工编辑；新增文案请改对应分类文件",
        "",
    ]
    for cat in CATEGORY_ORDER:
        idx_lines.append(f"import {cat} from './{cat}'")
    idx_lines.append("")
    idx_lines.append("export default {")
    for cat in CATEGORY_ORDER:
        idx_lines.append(f"  ...{cat},")
    idx_lines.append("}")
    idx_lines.append("")
    (out_dir / "index.ts").write_text("\n".join(idx_lines), encoding="utf-8")
    print(f"[{locale}] index.ts written")

    # ---- 校验：每个分类文件内的模块块与原文件逐块比对（防丢块/串块/文本损坏）----
    merged_names: list[str] = []
    for cat in CATEGORY_ORDER:
        content = (out_dir / f"{cat}.ts").read_text(encoding="utf-8")
        assert "export default {" in content, f"[{locale}] {cat}.ts 缺少 export default {{"
        assert content.rstrip().endswith("}"), f"[{locale}] {cat}.ts 缺少收尾 }}"
        si = content.index("export default {") + len("export default {")
        cat_blocks = split_modules("export default {" + content[si:])
        cat_names = [n for n, _ in cat_blocks]
        assert len(cat_names) == len(set(cat_names)), f"[{locale}] {cat}.ts 存在重复模块"
        merged_names.extend(cat_names)

        expected = dict(grouped[cat])
        got = dict(cat_blocks)
        assert sorted(got) == sorted(expected), (
            f"[{locale}] 分类 {cat} 模块集合不一致: 缺 {sorted(set(expected) - set(got))} 多 {sorted(set(got) - set(expected))}"
        )
        for n, b in expected.items():
            assert got[n].rstrip() == b.rstrip(), f"[{locale}] 分类 {cat} 模块 {n} 文本不一致"
        print(f"[{locale}] {cat}.ts: {len(cat_blocks)} modules 逐块一致")

    assert sorted(merged_names) == sorted(names), f"[{locale}] 拆分后模块集合不一致"
    print(f"[{locale}] OK: {len(names)} 个模块全部逐块一致，无丢失/重复/串改")

    # 校验成功后删除旧单文件（避免 ./locales/zh-CN 解析歧义）
    locale_file.unlink()
    print(f"[{locale}] 已删除旧文件 {locale_file.name}")


if __name__ == "__main__":
    build(OLD_ZH, "zh-CN")
    build(OLD_EN, "en-US")
    print("ALL OK")
