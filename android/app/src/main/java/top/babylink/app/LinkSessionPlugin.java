package top.babylink.app;

import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "LinkSession")
public class LinkSessionPlugin extends Plugin {
    private static final String PREFERENCES_NAME = "link_secure_session";
    private static final String TOKEN_KEY = "encrypted_token";
    private static final String KEY_ALIAS = "link_native_session_key_v1";

    @PluginMethod
    public void getSession(PluginCall call) {
        getBridge().execute(() -> {
            try {
                JSObject result = new JSObject();
                result.put("token", readToken());
                call.resolve(result);
            } catch (Exception error) {
                call.reject("无法读取系统安全存储中的会话。", error);
            }
        });
    }

    @PluginMethod
    public void setSession(PluginCall call) {
        String token = call.getString("token", "").trim();
        if (token.isEmpty() || token.length() > 4096) {
            call.reject("原生会话令牌无效。");
            return;
        }
        getBridge().execute(() -> {
            try {
                preferences().edit().putString(TOKEN_KEY, encrypt(token)).apply();
                call.resolve();
            } catch (Exception error) {
                call.reject("无法写入系统安全存储中的会话。", error);
            }
        });
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        preferences().edit().remove(TOKEN_KEY).apply();
        call.resolve();
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFERENCES_NAME, android.content.Context.MODE_PRIVATE);
    }

    private String readToken() throws Exception {
        String encrypted = preferences().getString(TOKEN_KEY, "");
        if (encrypted == null || encrypted.isEmpty()) return "";
        try {
            return decrypt(encrypted);
        } catch (Exception error) {
            preferences().edit().remove(TOKEN_KEY).apply();
            throw error;
        }
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
            generator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
    }

    private String encrypt(String token) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        String iv = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP);
        String payload = Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        return iv + ":" + payload;
    }

    private String decrypt(String encrypted) throws Exception {
        String[] parts = encrypted.split(":", 2);
        if (parts.length != 2) throw new IllegalStateException("Encrypted session payload is invalid.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
}