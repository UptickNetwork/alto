# Alto 认证与调用策略说明

本文档说明当前 Alto 中新增的认证与防滥用能力，包括：

- API Key 认证
- 受保护方法控制
- 速率限制（Rate Limit）
- 每日 Gas 配额（Quota）
- Redis 动态策略热更新
- 运维脚本（set/get/del/list/validate）

## 1. 设计目标

该能力用于解决以下问题：

- 防止 `eth_sendUserOperation` 等高风险接口被匿名无限调用
- 防止第三方长期消耗 Bundler 资源与代付能力
- 支持按租户（API Key）差异化限流和配额
- 支持多实例部署下的统一策略与统一计数

## 2. 生效链路（请求流程）

在 RPC 请求进入方法处理前（`handleMethod` 前），会执行：

1. 身份识别（Identity）
2. 认证（Authentication）
3. 速率限制（Rate Limit）
4. Gas 配额检查（Quota）

若任一步失败，请求会直接返回 RPC 错误，不会进入业务执行。

## 3. 认证模式

当前支持两种模式（`auth-mode`）：

- `none`：不启用 API Key 认证（仅建议开发环境）
- `api-key`：启用 API Key 认证（生产推荐）

当启用 `api-key` 且请求命中受保护方法时，请求必须带：

- Header: `x-api-key: <your-key>`

否则会被拒绝。

## 4. 配置项说明

以下配置均可通过 CLI 参数或 `ALTO_` 前缀环境变量注入：

- `auth-mode`
  - `none | api-key`
  - 默认：`none`
- `auth-api-keys`
  - 逗号分隔的合法 key 列表
  - 示例：`keyA,keyB,keyC`
- `auth-protected-methods`
  - 需要保护的方法集合（逗号分隔）
  - 默认：`eth_sendUserOperation,pimlico_sendUserOperationNow,boost_sendUserOperation`
- `auth-rate-limit-window-ms`
  - 全局默认限流窗口（毫秒）
  - 默认：`1000`
- `auth-rate-limit-max-requests`
  - 全局默认窗口内最大请求数
  - 默认：`10`
- `auth-gas-quota-daily-limit`
  - 全局默认日 gas 配额（`0` 表示关闭）
  - 默认：`0`
- `auth-api-key-policies`
  - 本地静态每 key 策略（JSON 字符串）
- `auth-api-key-policies-redis-key`
  - Redis 动态策略 Hash Key
  - 默认：`auth:api-key-policies`
- `auth-api-key-policies-cache-ms`
  - Redis 策略本地缓存时长（毫秒）
  - 默认：`3000`

> 说明：Redis 连接复用 `redis-mempool-url`（即 `ALTO_REDIS_MEMPOOL_URL`）。

## 5. 策略优先级

同一个 API Key 的最终策略按以下优先级计算（高到低）：

1. Redis 动态策略（存在即优先）
2. 本地静态策略 `auth-api-key-policies`
3. 全局默认参数（`auth-protected-methods` / `auth-rate-limit-*` / `auth-gas-quota-*`）

## 6. 每 Key 策略格式

策略对象支持字段：

- `methods`: string[]（该 key 适用的方法集合）
- `rateLimitWindowMs`: number（正整数）
- `rateLimitMaxRequests`: number（正整数）
- `gasQuotaDailyLimit`: string/number（可转 BigInt，且 >= 0）

示例：

```json
{
  "methods": ["eth_sendUserOperation", "boost_sendUserOperation"],
  "rateLimitWindowMs": 1000,
  "rateLimitMaxRequests": 20,
  "gasQuotaDailyLimit": "20000000"
}
```

## 7. Redis 存储模型

### 7.1 限流计数 Key

格式：

`<chainId>:auth:rate-limit:<identity>:<method>`

其中 `identity` 可能是：

- `api-key:<key>`
- `ip:<ip>`

逻辑：

- `INCR` 自增
- 第一次写入设置 `PEXPIRE = rateLimitWindowMs`

### 7.2 配额计数 Key

格式：

`<chainId>:auth:gas-quota:<YYYY-MM-DD>:<identity>`

逻辑：

- 使用 `WATCH/MULTI/EXEC` 乐观锁更新，避免并发覆盖
- 超过日配额直接拒绝

### 7.3 动态策略 Hash

默认 Hash Key：

`auth:api-key-policies`

Hash Field：

- field = API Key
- value = 对应策略 JSON 字符串

## 8. 运维脚本

已提供以下命令：

- `pnpm policy:set -- --key <key> --policy '<json>'`
- `pnpm policy:get -- --key <key>`
- `pnpm policy:del -- --key <key>`
- `pnpm policy:list`
- `pnpm policy:validate`

### 8.1 依赖环境变量

脚本读取 Redis 地址：

- 优先：`ALTO_REDIS_MEMPOOL_URL`
- 备选：`REDIS_URL`

动态策略 Hash Key：

- `ALTO_AUTH_API_KEY_POLICIES_REDIS_KEY`（默认 `auth:api-key-policies`）

### 8.2 policy:validate 输出与退出码

- 合法：`OK\t<key>`
- 非法：`INVALID\t<key>\t<error...>`
- 退出码：
  - `0`：全部合法
  - `2`：存在非法策略

## 9. 配置示例

### 9.1 启动时启用 API Key 认证（全局策略）

```bash
alto run \
  --auth-mode api-key \
  --auth-api-keys keyA,keyB \
  --auth-protected-methods eth_sendUserOperation,pimlico_sendUserOperationNow,boost_sendUserOperation \
  --auth-rate-limit-window-ms 1000 \
  --auth-rate-limit-max-requests 10 \
  --auth-gas-quota-daily-limit 50000000
```

### 9.2 启动时注入静态每 Key 策略

```bash
alto run \
  --auth-mode api-key \
  --auth-api-keys keyA,keyB \
  --auth-api-key-policies '{"keyA":{"methods":["eth_sendUserOperation"],"rateLimitMaxRequests":20,"gasQuotaDailyLimit":"30000000"},"keyB":{"rateLimitMaxRequests":5,"gasQuotaDailyLimit":"5000000"}}'
```

### 9.3 运行中热更新（无需重启）

```bash
pnpm policy:set -- --key keyA --policy '{"methods":["eth_sendUserOperation"],"rateLimitWindowMs":1000,"rateLimitMaxRequests":30,"gasQuotaDailyLimit":"40000000"}'
```

## 10. 检查与排查建议

### 10.1 快速检查项

- `auth-mode` 是否为 `api-key`
- 请求是否携带 `x-api-key`
- key 是否包含在 `auth-api-keys`
- 方法是否在有效策略的 `methods` 内
- Redis 是否可连接（多实例建议必须可用）

### 10.2 常见拒绝原因

- `missing x-api-key header`
- `invalid api key`
- `rate limit exceeded`
- `daily gas quota exceeded`
- `concurrent quota update failed, retry later`
- `invalid api key policy payload in redis`

### 10.3 推荐巡检流程

1. `pnpm policy:list` 查看当前动态策略
2. `pnpm policy:validate` 校验策略格式
3. 对重点 key 用 `policy:get` 抽样确认
4. 观察调用错误率和被限流比例（接入监控）

## 11. 生产建议

- 生产环境务必启用 `auth-mode=api-key`
- 建议仅保护高风险写接口，查询接口按需开放
- 每个 key 设置独立限流和配额，不建议全租户共用一个 key
- 在网关层叠加限流/黑白名单（双层防护）
- 为策略变更建立变更记录与回滚流程
- 对 `policy:validate` 加入定时巡检或 CI 任务

