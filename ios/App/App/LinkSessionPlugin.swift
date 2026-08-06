import Capacitor
import Foundation
import Security

@objc(LinkSessionPlugin)
final class LinkSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "LinkSessionPlugin"
    let jsName = "LinkSession"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSession", returnType: CAPPluginReturnPromise)
    ]

    private let service = "top.babylink.app.native-session"
    private let account = "primary"

    @objc func getSession(_ call: CAPPluginCall) {
        do {
            call.resolve(["token": try readToken()])
        } catch {
            call.reject("无法读取系统安全存储中的会话。", nil, error)
        }
    }

    @objc func setSession(_ call: CAPPluginCall) {
        let token = call.getString("token", "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty, token.count <= 4096 else {
            call.reject("原生会话令牌无效。")
            return
        }
        do {
            try writeToken(token)
            call.resolve()
        } catch {
            call.reject("无法写入系统安全存储中的会话。", nil, error)
        }
    }

    @objc func clearSession(_ call: CAPPluginCall) {
        SecItemDelete(baseQuery() as CFDictionary)
        call.resolve()
    }

    private func baseQuery() -> [CFString: Any] {
        [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
    }

    private func readToken() throws -> String {
        var query = baseQuery()
        query[kSecReturnData] = true
        query[kSecMatchLimit] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return "" }
        guard status == errSecSuccess, let data = result as? Data, let token = String(data: data, encoding: .utf8) else {
            throw NSError(domain: "BabyLinkSession", code: Int(status), userInfo: nil)
        }
        return token
    }

    private func writeToken(_ token: String) throws {
        let data = Data(token.utf8)
        let query = baseQuery()
        let update = [kSecValueData: data]
        let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw NSError(domain: "BabyLinkSession", code: Int(updateStatus), userInfo: nil)
        }
        var item = query
        item[kSecValueData] = data
        item[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let insertStatus = SecItemAdd(item as CFDictionary, nil)
        guard insertStatus == errSecSuccess else {
            throw NSError(domain: "BabyLinkSession", code: Int(insertStatus), userInfo: nil)
        }
    }
}