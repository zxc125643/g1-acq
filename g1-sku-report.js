/* Local-only report served by a Shadowrocket http-request script. */
"use strict";

(function () {
  var ROOT = "https://one.google.com/g1-sku-report";
  var VERSION = "v7.6.0";
  var COLLECTOR_VERSION = "g1-acq-v7.6";
  var CONFIGURED_TARGET = "com.google.gemini.2tb.ai.m.3month_ip_99p";
  var LEGACY_TARGET = "g1.2tb.ai.annual";
  var SCAN_KEY = "g1.sku.scan.v1";
  var TEST_KEY = "g1.pro.annual.test.v1";
  var url = typeof $request === "object" && $request ? $request.url : "";
  if (typeof url !== "string" || !/^https:\/\/one\.google\.com\/g1-sku-report\/?(?:\?|$)/.test(url)) {
    $done({});
    return;
  }

  var storageAvailable = typeof $persistentStore !== "undefined" &&
    typeof $persistentStore.read === "function";
  var clearMessage = "";
  if (/(?:\?|&)clear=1(?:&|$)/.test(url)) {
    try {
      var scanCleared = $persistentStore.write("{}", SCAN_KEY);
      var testCleared = $persistentStore.write("{}", TEST_KEY);
      clearMessage = scanCleared && testCleared ? "本工具的两份本地记录已清空。" : "本地记录清空未完成。";
    } catch (error) {
      clearMessage = "本地存储接口暂未就绪。";
    }
  }

  function load(key) {
    if (!storageAvailable) return {};
    try {
      var value = JSON.parse($persistentStore.read(key) || "{}");
      return value && value.schemaVersion === 1 ? value : {};
    } catch (error) {
      return {};
    }
  }
  function text(value, length) {
    return typeof value === "string" ? value.slice(0, length || 180) : "";
  }
  function count(value) {
    var number = Number(value);
    return isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }
  function sku(value) {
    return typeof value === "string" && /^(?:g1\.|com\.google\.gemini\.)[A-Za-z0-9._-]{1,160}$/.test(value) ? value : "";
  }
  function rows(value, withTime) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 300).filter(function (row) {
      return row && typeof row.id === "string" &&
        /^(?:g1\.|com\.google\.one\.)[A-Za-z0-9._-]{1,160}$/.test(row.id);
    }).map(function (row) {
      var out = { id: row.id, count: count(row.count) };
      if (withTime) {
        out.lastSeen = text(row.lastSeen, 32);
      } else {
        out.to = sku(row.to) || "";
        out.fallback = row.fallback === true;
      }
      return out;
    }).sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  }

  var scanStatuses = {
    "new-skus": "发现并录入新编号",
    "known-skus": "收到响应，编号与已有记录重复",
    "no-skus": "收到文本响应，本次没有商品编号",
    "limit-reached": "收到新编号，已达采集容量上限",
    "non-text": "收到响应，正文不是可扫描文本"
  };
  var scanPaths = ["/", "/ai", "/plans", "/_/…/data/batchexecute", "[其他 one.google.com 路径]"];
  function recent(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(-10).filter(function (event) {
      return event && typeof event.at === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(event.at) &&
        (event.bodyType === "text" || event.bodyType === "non-text") &&
        Object.prototype.hasOwnProperty.call(scanStatuses, event.status);
    }).map(function (event) {
      return {
        at: event.at,
        path: scanPaths.indexOf(event.path) !== -1 ? event.path : "[其他 one.google.com 路径]",
        bodyType: event.bodyType,
        status: event.status,
        candidateCount: count(event.candidateCount),
        addedCount: count(event.addedCount),
        omittedCount: count(event.omittedCount)
      };
    });
  }

  var scanRaw = load(SCAN_KEY);
  var testRaw = load(TEST_KEY);
  var recordedTarget = sku(testRaw.target);
  if (!recordedTarget && /^(?:pro-annual-test-v[12]|g1-acq-v7(?:\.0|\.1)?)$/.test(testRaw.version || "")) {
    recordedTarget = LEGACY_TARGET;
  }
  var matchedFrom = rows(testRaw.matchedFrom, false);
  if (!recordedTarget) {
    matchedFrom.some(function (row) {
      if (row.to) {
        recordedTarget = row.to;
        return true;
      }
      return false;
    });
  }
  var storedOrigin = text(testRaw.targetOrigin, 32);
  var targetOrigin = recordedTarget && /^(?:user-specified|pattern-derived|legacy)$/.test(storedOrigin) ?
    storedOrigin : recordedTarget === CONFIGURED_TARGET ? "user-specified" :
      recordedTarget === LEGACY_TARGET ? "legacy" : "";
  var report = {
    schemaVersion: 1,
    reportVersion: VERSION,
    configuredTarget: CONFIGURED_TARGET,
    storageAvailable: storageAvailable,
    scan: {
      version: text(scanRaw.version, 32),
      updatedAt: text(scanRaw.updatedAt, 32),
      scannedResponses: count(scanRaw.scannedResponses),
      matchedResponses: count(scanRaw.matchedResponses),
      nonTextResponses: count(scanRaw.nonTextResponses),
      recentResponses: recent(scanRaw.recentResponses),
      truncated: scanRaw.truncated === true,
      limit: 300,
      skus: rows(scanRaw.skus, true)
    },
    test: {
      version: text(testRaw.version, 32),
      updatedAt: text(testRaw.updatedAt, 32),
      target: recordedTarget,
      targetOrigin: targetOrigin,
      status: text(testRaw.status, 32),
      hitCount: count(testRaw.hitCount),
      matchedFrom: matchedFrom
    }
  };

  var headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-G1-Report-Version": VERSION,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
  };
  var exportJSON = /(?:\?|&)format=json(?:&|$)/.test(url);
  console.log("[g1-sku-report] " + VERSION + " " + (exportJSON ? "json" : "html") +
    " storage=" + (storageAvailable ? "ready" : "unavailable") + " candidates=" + report.scan.skus.length);
  if (exportJSON) {
    headers["Content-Type"] = "application/json; charset=utf-8";
    headers["Content-Disposition"] = 'attachment; filename="g1-sku-report.json"';
    $done({ response: { status: 200, headers: headers, body: JSON.stringify(report, null, 2) } });
    return;
  }

  function escape(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }
  function table(items, withTime) {
    if (!items.length) return "<p>暂无记录。</p>";
    return "<div class=scroll><table><thead><tr><th>完整商品编号</th><th>次数</th>" +
      (withTime ? "<th>最近发现时间（UTC）</th>" : "<th>实际目标 SKU</th><th>备用档</th>") + "</tr></thead><tbody>" +
      items.map(function (row) {
        return "<tr><td><code>" + escape(row.id) + "</code></td><td>" + row.count + "</td>" +
          (withTime ? "<td>" + escape(row.lastSeen) + "</td>" :
            "<td><code>" + escape(row.to || "未记录") + "</code></td><td>" + (row.fallback ? "75p" : "否") + "</td>") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }
  function recentTable(events) {
    if (!events.length) return "<p>尚无逐次响应记录；旧版采集数据没有这项诊断。</p>";
    return "<div class=scroll><table><thead><tr><th>时间（UTC）</th><th>路径分类</th><th>本次结果</th><th>识别编号</th><th>新增录入</th><th>容量外编号</th></tr></thead><tbody>" +
      events.slice().reverse().map(function (event) {
        return "<tr><td>" + escape(event.at) + "</td><td>" + escape(event.path) +
          "</td><td>" + scanStatuses[event.status] + "</td><td>" + event.candidateCount +
          "</td><td>" + event.addedCount + "</td><td>" + event.omittedCount + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  var latestScan = report.scan.recentResponses.length ?
    report.scan.recentResponses[report.scan.recentResponses.length - 1] : null;
  var scanVersionStatus = report.scan.version === COLLECTOR_VERSION ?
    "记录来自本版采集脚本；按响应时间与计数判断是否产生了新记录。" :
    report.scan.version ? "旧采集记录；尚未保存本版采集响应记录。" : "尚未保存本版采集响应记录。";
  var statuses = {
    "rewritten": "已执行字符串替换",
    "no-match": "本次响应未命中映射的源商品",
    "non-text": "本次响应没有可处理的文本正文"
  };
  var status = Object.prototype.hasOwnProperty.call(statuses, report.test.status) ?
    statuses[report.test.status] : "暂无测试执行记录";
  if (report.test.version === "pro-annual-test-v1" && report.test.status === "no-match") {
    status = "旧 v1 记录：本次响应未命中 iOS 2TB 前缀";
  }
  var html = [
    "<!doctype html><html lang=zh-CN><meta charset=utf-8>",
    "<meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Google One SKU 本地报告</title>",
    "<style>body{font:16px/1.6 -apple-system,BlinkMacSystemFont,sans-serif;max-width:960px;margin:24px auto;padding:0 18px;color:#1c2737;background:#f5f7fa}section{background:white;border:1px solid #dde3ec;border-radius:12px;padding:18px;margin:18px 0}h1{font-size:24px;margin-bottom:10px}h2{font-size:20px}code{overflow-wrap:anywhere}a{color:#1259be}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:9px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}.scroll{overflow:auto}.note{color:#46556b}.badge{display:inline-block;background:#e0f4e8;color:#176238;padding:4px 10px;border-radius:8px}.actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:20px 0}.actions form{margin:0}button,.actions a{font:inherit;padding:10px 16px;border:0;border-radius:8px;cursor:pointer;text-decoration:none}.actions a{background:#e4eaf3}.actions button{background:#1259be;color:white}button{background:#e4eaf3;color:#1c2737}</style>",
    "<h1>Google One SKU 本地报告</h1>",
    "<p class=badge>本机脚本已接管 · " + VERSION + "</p>",
    "<nav class=actions aria-label=报告操作><form method=get action=\"" + ROOT + "\"><button type=submit name=format value=json>导出 JSON</button></form><a href=\"" + ROOT + "\">刷新报告</a></nav>",
    "<p class=note>此页由当前设备的 Shadowrocket 生成；地址栏沿用 one.google.com，采集记录保存在当前设备。</p>",
    "<p class=note>保持一个 G1 ACQ 模块开启即可：先采集原始响应中的编号，再执行改写。</p>",
    clearMessage ? "<p>" + escape(clearMessage) + "</p>" : "",
    storageAvailable ? "" : "<p>本地存储接口暂未就绪；此页尚未读取到采集记录。</p>",
    "<section><h2>采集运行记录</h2>",
    "<p>实际采集脚本：<code>" + escape(report.scan.version || "暂无记录") + "</code><br>" + scanVersionStatus + "</p>",
    "<p>已扫描文本响应：" + report.scan.scannedResponses + "；已记录非文本响应：" + report.scan.nonTextResponses +
      "；含商品编号的响应：" + report.scan.matchedResponses + "；累计编号：" + report.scan.skus.length + "</p>",
    "<p>最近保存时间（UTC）：" + escape(report.scan.updatedAt || "暂无") + "</p>",
    latestScan ? "<p><strong>最近一条：" + scanStatuses[latestScan.status] + "</strong><br>识别 " +
      latestScan.candidateCount + " 个不同编号，新增录入 " + latestScan.addedCount + " 个，容量外 " + latestScan.omittedCount + " 个。</p>" : "",
    "<p class=note>累计清单按编号去重；收到相同编号会更新次数，清单条数保持不变。先记录计数和时间，重新打开 Google App 方案页，再刷新本报告对照。</p>",
    "<h3>最近 10 次响应</h3>", recentTable(report.scan.recentResponses),
    "<p class=note>计数增加且显示重复编号，表示已收到响应；时间和计数保持原值，表示尚无新的匹配响应记录，可核对页面缓存、模块开关、HTTPS 解密、请求域名与脚本日志中的 saved=no。路径仅保存分类。</p></section>",
    "<section><h2>最近一次映射</h2>",
    "<p>当前生效的目标编号：<code>" + CONFIGURED_TARGET + "</code></p>",
    "<p class=note>本版只保留一条映射：20TB 月付源编号改写成上面这个 Gemini 编号；实际商品、价格与扣款周期以 App Store 购买面板为准。</p>",
    "<p>版本：" + escape(report.test.version || "暂无") + "<br>状态：" + escape(status) + "；总替换次数：" + report.test.hitCount + "</p>",
    "<p>记录的原始源编号：<code>g1.ios.20tb.m.v2</code><br>该次记录的目标：<code>" + escape(report.test.target || "暂无记录") + "</code><br>各次实际替换见下表。<br>执行时间（UTC）：" + escape(report.test.updatedAt || "暂无") + "</p>",
    "<p class=note>这里记录的是脚本执行结果；商品是否被 App Store 识别、价格和周期需查看购买面板。</p>",
    table(report.test.matchedFrom, false), "</section>",
    "<section><h2>浏览页面时采集到的候选 SKU</h2>",
    "<p>累计编号：" + report.scan.skus.length + "；同一编号合并计数，每次响应的新增与重复情况见上方采集运行记录。</p>",
    "<p class=note>编号在改写前从原始响应中提取，并非商店的完整商品目录；脚本生成的替换目标不会自动加入这份清单。</p>",
    report.scan.truncated ? "<p>记录已达到 300 个上限；清空后可重新采集目标页面。</p>" : "",
    table(report.scan.skus, true),
    "<p>更新时间（UTC）：" + escape(report.scan.updatedAt || "暂无") + "</p></section>",
    "<form method=get action=\"" + ROOT + "\"><button name=clear value=1>清空本工具的采集与测试记录</button></form>",
    "<p class=note>浏览方案后刷新本页查看记录；独立采集器和历史改写副本保持停用，避免重复记录。</p></html>"
  ].join("");
  $done({ response: { status: 200, headers: headers, body: html } });
})();
