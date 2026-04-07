const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const fs = require('fs');
const path = require('path');

const server = new Server(
    { name: "zhougong-dream-professional", version: "1.1.0" },
    { capabilities: { tools: {} } }
);

const getLuckLevel = (text) => {
    if (text.match(/吉|大吉|富贵|进财|昌|喜|官|位/)) return "AUSPICIOUS";
    if (text.match(/凶|大凶|病|死|忧|丧|口舌|争斗/)) return "OMINOUS";
    return "NEUTRAL";
};
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "interpret_dream",
            description: "高级梦境检索工具。返回结构化 JSON 数据与可视化 Markdown 报告，支持多场景匹配。",
            inputSchema: {
                type: "object",
                properties: {
                    keyword: {
                        type: "string",
                        description: "核心梦境意象。工具会自动清洗‘梦见’、‘梦到’等前缀。"
                    },
                },
                required: ["keyword"],
            },
        },
    ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "interpret_dream") {
        let { keyword } = request.params.arguments;
        keyword = keyword.replace(/(梦见|梦到|梦到了|我梦见|一个)/g, "").trim();

        const jsonPath = path.join(__dirname, 'dreams.json');
        if (!fs.existsSync(jsonPath)) {
            throw new Error("Database initialization failed: dreams.json not found.");
        }

        const dreamData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        let results = dreamData.filter(item =>
            item.keyword.includes(keyword) || item.interpretation.includes(keyword)
        );

        if (results.length === 0 && keyword.length >= 2) {
            results = dreamData.filter(item => item.keyword.includes(keyword.slice(-1)));
        }

        if (results.length === 0) {
            return {
                isError: true,
                content: [{ type: "text", text: `未找到与“${keyword}”相关的古籍记载。` }]
            };
        }
        const finalResults = results.slice(0, 8);

        const tableHeader = "| 预兆 | 分类 | 匹配场景 | 古籍断语 |\n| :--- | :--- | :--- | :--- |\n";
        const tableRows = finalResults.map(r => {
            const level = getLuckLevel(r.interpretation);
            const luckIcon = level === "AUSPICIOUS" ? "✓" : level === "OMINOUS" ? "✕" : "○";
            return `| ${luckIcon} ${level} | ${r.category} | **${r.keyword}** | ${r.interpretation} |`;
        }).join('\n');

        const uiMarkdown = [
            `### 🌌 检索报告: ${keyword}`,
            `共发现 ${results.length} 条匹配，展示前 ${finalResults.length} 条：`,
            ``,
            tableHeader + tableRows,
            ``,
            `---`
        ].join('\n');
        const machineData = {
            metadata: {
                engine: "ZhouGong-MCP",
                query: keyword,
                total_matches: results.length
            },
            data: finalResults.map(r => ({
                category: r.category,
                scene: r.keyword,
                interpretation: r.interpretation,
                luck_level: getLuckLevel(r.interpretation)
            }))
        };

        return {
            content: [
                {
                    type: "text",
                    text: uiMarkdown
                },
                {
                    type: "text",
                    text: `[STRUCTURED_DATA_BLOCK]\n${JSON.stringify(machineData, null, 2)}`
                }
            ]
        };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(console.error);