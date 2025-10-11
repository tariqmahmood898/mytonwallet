package org.mytonwallet.app_air.walletcore.models

import com.squareup.moshi.JsonClass
import org.json.JSONObject
import org.mytonwallet.app_air.walletbasecontext.utils.doubleAbsRepresentation
import org.mytonwallet.app_air.walletcontext.globalStorage.WGlobalStorage
import org.mytonwallet.app_air.walletcore.DEFAULT_SHOWN_TOKENS
import org.mytonwallet.app_air.walletcore.MAIN_NETWORK
import org.mytonwallet.app_air.walletcore.WalletCore
import org.mytonwallet.app_air.walletcore.stores.BalanceStore
import org.mytonwallet.app_air.walletcore.stores.TokenStore

@JsonClass(generateAdapter = true)
class MAccount(
    var accountId: String,
    val byChain: Map<String, AccountChain>,
    var name: String,
    var accountType: AccountType,
    var importedAt: Long?,
) {

    @JsonClass(generateAdapter = true)
    data class AccountChain(
        val address: String,
        val domain: String? = null,
        val isMultisig: Boolean? = null,
        var ledgerIndex: Int? = null
    )

    @JsonClass(generateAdapter = false)
    enum class AccountType(val value: String) {
        MNEMONIC("mnemonic"),
        HARDWARE("hardware"),
        VIEW("view");

        companion object {
            fun fromValue(value: String): AccountType? = entries.find { it.value == value }
        }

        val badge: String?
            get() {
                return when (this) {
                    MNEMONIC -> null
                    HARDWARE -> "LEDGER"
                    VIEW -> "VIEW"
                }
            }
    }

    val isViewOnly: Boolean
        get() {
            return accountType == AccountType.VIEW
        }

    @JsonClass(generateAdapter = true)
    data class Ledger(val driver: Driver, val index: Int) {
        @JsonClass(generateAdapter = false)
        enum class Driver(val value: String) {
            HID("HID"),
        }

        constructor(json: JSONObject) : this(
            Driver.valueOf(json.optString("driver")),
            json.optInt("index")
        )
    }

    init {
        if (name.isEmpty()) {
            name = WGlobalStorage.getAccountName(accountId) ?: ""
        }
    }

    constructor(accountId: String, globalJSON: JSONObject) : this(
        accountId,
        parseByChain(globalJSON.optJSONObject("byChain")),
        globalJSON.optString("title"),
        AccountType.fromValue(globalJSON.optString("type"))!!,
        globalJSON.optLong("importedAt"),
    )

    companion object {
        fun parseByChain(byChainJson: JSONObject?): Map<String, AccountChain> {
            val result = mutableMapOf<String, AccountChain>()
            byChainJson?.keys()?.forEach { chain ->
                val chainData = byChainJson.getJSONObject(chain)
                result[chain] = AccountChain(
                    address = chainData.getString("address"),
                    domain = chainData.optString("domain").takeIf { it.isNotEmpty() },
                    isMultisig = chainData.optBoolean("isMultisig")
                        .takeIf { chainData.has("isMultisig") },
                    ledgerIndex = chainData.optInt("ledgerIndex")
                )
            }
            return result
        }
    }

    val isHardware: Boolean
        get() {
            return accountType == AccountType.HARDWARE
        }

    val tonAddress: String?
        get() {
            return byChain["ton"]?.address
        }

    val tronAddress: String?
        get() {
            return byChain["tron"]?.address
        }

    val firstAddress: String?
        get() {
            return if (tonAddress != null)
                tonAddress
            else {
                try {
                    byChain.entries.first().value.address
                } catch (_: Exception) {
                    null
                }
            }
        }

    val isMultichain: Boolean
        get() {
            return byChain.keys.size > 1
        }

    val addressByChain: Map<String, String>
        get() = byChain.mapValues { it.value.address }

    val supportsSwap: Boolean
        get() {
            return WalletCore.activeNetwork == MAIN_NETWORK && accountType == AccountType.MNEMONIC
        }

    val supportsBuyWithCard: Boolean
        get() {
            return WalletCore.activeNetwork == MAIN_NETWORK && accountType != AccountType.VIEW
        }

    val supportsBuyWithCrypto: Boolean
        get() {
            return supportsSwap
        }

    val supportsCommentEncryption: Boolean
        get() {
            return accountType == AccountType.MNEMONIC
        }

    val isNew: Boolean
        get() {
            val balances = BalanceStore.getBalances(accountId) ?: return false
            return balances.size <= DEFAULT_SHOWN_TOKENS.size && balances.filter {
                val token = TokenStore.getToken(it.key) ?: return@filter false
                return@filter token.priceUsd *
                    it.value.doubleAbsRepresentation(token.decimals) >= 0.01
            }.isEmpty()
        }
}
