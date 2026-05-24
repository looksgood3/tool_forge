package outlookmail

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"

	"github.com/zalando/go-keyring"
)

// keyring 里保存主密钥的 key 名(service 复用全局 tool-forge)
const (
	keyringService     = "tool-forge"
	keyringMasterKey   = "outlook-mail.master-key"
	masterKeySizeBytes = 32 // AES-256
)

// loadOrCreateMasterKey 从系统凭据库读取主密钥;首次运行时生成新密钥并保存。
//
// 主密钥用于加密 refresh_token,丢失意味着所有保存的 token 失效。
// 不直接落盘文件,只在 keyring(Windows Credential Manager / macOS Keychain / Linux Secret Service)里。
func loadOrCreateMasterKey() ([]byte, error) {
	encoded, err := keyring.Get(keyringService, keyringMasterKey)
	if err == nil && encoded != "" {
		key, decErr := base64.StdEncoding.DecodeString(encoded)
		if decErr == nil && len(key) == masterKeySizeBytes {
			return key, nil
		}
	}
	// 没有,或损坏 → 生成新的
	key := make([]byte, masterKeySizeBytes)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	if err := keyring.Set(keyringService, keyringMasterKey, base64.StdEncoding.EncodeToString(key)); err != nil {
		return nil, err
	}
	return key, nil
}

// encryptRT 用 AES-256-GCM 加密 refresh_token,输出 base64(nonce || ciphertext)。
func encryptRT(masterKey []byte, plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ct := gcm.Seal(nil, nonce, []byte(plaintext), nil)
	// nonce || ciphertext(含 tag)
	buf := make([]byte, 0, len(nonce)+len(ct))
	buf = append(buf, nonce...)
	buf = append(buf, ct...)
	return base64.StdEncoding.EncodeToString(buf), nil
}

// decryptRT 反向解密,空字符串原样返回。
func decryptRT(masterKey []byte, encoded string) (string, error) {
	if encoded == "" {
		return "", nil
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	nonce := raw[:gcm.NonceSize()]
	ct := raw[gcm.NonceSize():]
	pt, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}
	return string(pt), nil
}
