G1 ACQ v7.6.0 上传包
=====================

三个文件（放在仓库根目录，分支用 main）：
1. g1-acq.js            响应脚本：把 g1.ios.20tb.m.v2 改写成 com.google.gemini.2tb.ai.m.3month_ip_99p，并保留采集
2. g1-sku-report.js     本地报告页脚本（one.google.com/g1-sku-report）
3. g1-acq-v7.sgmodule   模块文件，导入小火箭用

注意：包里有两个 sgmodule
- g1-acq-v7.sgmodule        脚本地址还指向 crhywun/g1-acq@v7.6.0（官方旧版脚本），别直接导这个
- g1-acq-v7-模板.sgmodule   把里面的“你的用户名/你的仓库”改成你自己的，再导入

怎么改成能直接导入的链接
------------------------
1) 上传三个文件到你的仓库（main 分支），文件名不要改。
2) 打开 g1-acq-v7-模板.sgmodule，把两处
     你的用户名/你的仓库@main
   改成你自己的，例如
     zhangsan/g1-acq@main
3) 这个文件本身也要传上去，然后在浏览器打开它的公网直链，就是小火箭要的导入地址：
     https://cdn.jsdelivr.net/gh/zhangsan/g1-acq@main/g1-acq-v7.sgmodule
   备用（jsDelivr 没缓存到时）：
     https://raw.githubusercontent.com/zhangsan/g1-acq/main/g1-acq-v7.sgmodule
4) 小火箭 → 首页右上角 + → 类型选“模块” → 粘贴地址 → 下载。
   （不是“订阅”，模块在模块管理里加）

两点提醒
--------
- 用 @main 时 jsDelivr 有缓存，改完文件可能要等一会儿才生效；想立刻生效就用 raw 那条。
- 别装工作区里那个旧的 g1-clean.js（g1.ios.20tb.m.v2 → g1.ios.20tb.m），会和新规则打架。
