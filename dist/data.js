"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadData = loadData;
exports.saveData = saveData;
exports.addCount = addCount;
exports.getTop = getTop;
// src/data.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ROOT_DATA = path_1.default.join(process.cwd(), 'data.json');
const LEGACY_DATA = path_1.default.join(process.cwd(), 'src', 'data.json');
function safeRead(p) {
    try {
        const txt = fs_1.default.readFileSync(p, 'utf8').trim();
        if (!txt)
            return {}; // 空ファイルは {} とみなす
        return JSON.parse(txt);
    }
    catch {
        return null; // 壊れていたら null
    }
}
function loadData() {
    // ルート優先
    const root = safeRead(ROOT_DATA);
    if (root)
        return root;
    // 旧場所があれば移行
    const legacy = safeRead(LEGACY_DATA);
    if (legacy) {
        fs_1.default.writeFileSync(ROOT_DATA, JSON.stringify(legacy, null, 2));
        return legacy;
    }
    // どこにも無ければ作成
    fs_1.default.writeFileSync(ROOT_DATA, '{}');
    return {};
}
function saveData(data) {
    fs_1.default.writeFileSync(ROOT_DATA, JSON.stringify(data, null, 2));
}
function addCount(data, userId, by = 1) {
    const next = (data[userId] ?? 0) + by;
    data[userId] = next;
    saveData(data);
    return next;
}
function getTop(data, limit = 10) {
    return Object.entries(data)
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}
