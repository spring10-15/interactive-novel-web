// 📦 数据库配置
// 生产环境：使用腾讯云数据库
// 开发环境：使用 Mock 数据库

const isBrowser = typeof window !== "undefined";
const isProduction = process.env.NODE_ENV === "production";
const MOCK_STORAGE_KEY = "interactive-novel-writer-mock-db";

// 初始化状态
let initPromise: Promise<void> | null = null;
let initError: Error | null = null;

// Mock 数据库实现
function createMockDB() {
  const loadCollections = (): Record<string, any[]> => {
    if (!isBrowser) {
      return {};
    }

    try {
      const raw = window.localStorage.getItem(MOCK_STORAGE_KEY);
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      console.warn("⚠️ 读取 Mock 数据失败，已重置:", error);
      return {};
    }
  };

  const collections: Record<string, any[]> = loadCollections();

  const persistCollections = () => {
    if (!isBrowser) {
      return;
    }

    try {
      window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(collections));
    } catch (error) {
      console.warn("⚠️ 保存 Mock 数据失败:", error);
    }
  };

  return {
    collection: (name: string) => {
      if (!collections[name]) collections[name] = [];
      let items = [...collections[name]];

      const createCollectionMethods = (currentItems: any[]) => {
        const self = {
          add: async (data: any) => {
            const id = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const newItem = { _id: id, ...data };
            collections[name].push(newItem);
            persistCollections();
            return { id, data: newItem };
          },
          get: async () => ({ data: currentItems }),
          doc: (id: string) => ({
            id,
            get: async () => {
              const item = currentItems.find((i: any) => i._id === id);
              return { data: item ? [item] : [] };
            },
            update: async (updates: any) => {
              const index = collections[name].findIndex((i: any) => i._id === id);
              if (index >= 0) {
                collections[name][index] = { ...collections[name][index], ...updates };
                persistCollections();
              }
              return { ok: true };
            },
            remove: async () => {
              const index = collections[name].findIndex((i: any) => i._id === id);
              if (index >= 0) {
                collections[name].splice(index, 1);
                persistCollections();
              }
              return { ok: true };
            },
            set: async (data: any) => {
              const index = collections[name].findIndex((i: any) => i._id === id);
              if (index >= 0) {
                collections[name][index] = { _id: id, ...data };
              } else {
                collections[name].push({ _id: id, ...data });
              }
              persistCollections();
              return { ok: true };
            },
          }),
          where: (query: any) => {
            const filtered = currentItems.filter((item: any) => {
              return Object.keys(query).every((key) => item[key] === query[key]);
            });
            return createCollectionMethods(filtered);
          },
          orderBy: (field: string, order: string = "asc") => {
            const sorted = [...currentItems].sort((a: any, b: any) => {
              if (order === "desc") {
                return a[field] > b[field] ? -1 : 1;
              }
              return a[field] > b[field] ? 1 : -1;
            });
            return createCollectionMethods(sorted);
          },
          limit: (count: number) => {
            return createCollectionMethods(currentItems.slice(0, count));
          },
          remove: async () => {
            collections[name] = [];
            persistCollections();
            return { ok: true };
          },
          update: async (data: any) => {
            collections[name] = collections[name].map((item) => ({ ...item, ...data }));
            persistCollections();
            return { ok: true };
          },
          set: async () => ({ ok: true }),
          privateItems: currentItems,
        };
        return self;
      };

      return createCollectionMethods(items);
    },
  };
}

// 导出实例
let app: any = null;
let db: any = null;
let auth: any = null;

// 等待数据库初始化完成
export async function waitForDB() {
  if (initError) {
    throw initError;
  }
  if (initPromise) {
    await initPromise;
  }
  if (initError) {
    throw initError;
  }
  return db;
}

// 获取初始化错误（如果有）
export function getInitError() {
  return initError;
}

if (isBrowser) {
  if (isProduction) {
    // 生产环境：使用真实腾讯云数据库
    console.log("🚀 生产环境：使用腾讯云数据库");
    try {
      const cloudbase = require("@cloudbase/js-sdk");
      const envId = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;

      if (!envId || envId === "") {
        console.warn("⚠️ 微信云开发环境 ID 未配置，降级到 Mock");
        db = createMockDB();
      } else {
        app = cloudbase.init({ env: envId });
        db = app.database({ persistence: true });
        auth = app.auth({ persistence: "local" });
      }
    } catch (err) {
      console.warn("⚠️ 加载真实数据库失败，降级到 Mock:", err);
      db = createMockDB();
    }
  } else {
    // 开发环境：使用 Mock 数据库
    console.log("🧪 开发环境：使用 Mock 数据库");
    db = createMockDB();
  }
} else {
  // 服务端：用 Mock 数据库
  db = createMockDB();
  console.log("📍 使用 Mock 数据库（服务端）");
}

export { app, db, auth };
