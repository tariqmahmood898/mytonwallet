package org.mytonwallet.app_air.walletcore.moshi.api

import com.squareup.moshi.JsonClass
import org.mytonwallet.app_air.walletcore.models.MBlockchain
import org.mytonwallet.app_air.walletcore.moshi.ApiConnectionType
import org.mytonwallet.app_air.walletcore.moshi.ApiDapp
import org.mytonwallet.app_air.walletcore.moshi.ApiDappTransfer
import org.mytonwallet.app_air.walletcore.moshi.ApiTokenWithPrice
import org.mytonwallet.app_air.walletcore.moshi.ApiTonConnectProof
import org.mytonwallet.app_air.walletcore.moshi.MApiTransaction
import org.mytonwallet.app_air.walletcore.moshi.adapter.factory.JsonSealed
import org.mytonwallet.app_air.walletcore.moshi.adapter.factory.JsonSealedSubtype
import java.math.BigInteger

@JsonSealed("type")
sealed class ApiUpdate {
    @JsonSealedSubtype("dappSendTransactions")
    @JsonClass(generateAdapter = true)
    data class ApiUpdateDappSendTransactions(
        val promiseId: String,
        val accountId: String,
        val dapp: ApiDapp,
        val transactions: List<ApiDappTransfer>,
        val vestingAddress: String? = null,
        val validUntil: Long? = null,
        val emulation: Emulation? = null
    ) : ApiUpdate() {

        val isDangerous = transactions.any {
            it.isDangerous
        }

        @JsonClass(generateAdapter = true)
        data class Emulation(val activities: List<MApiTransaction>, val realFee: BigInteger)
    }

//    @JsonSealedSubtype("dappSignData")
//    @JsonClass(generateAdapter = true)
//    data class ApiUpdateDappSignData(
//        val promiseId: String,
//        val accountId: String,
//        val dapp: ApiDapp,
//        val payloadToSign: MSignDataPayload,
//    ) : ApiUpdate()

    @JsonSealedSubtype("dappConnect")
    @JsonClass(generateAdapter = true)
    data class ApiUpdateDappConnect(
        val identifier: String? = null,
        val promiseId: String,
        val accountId: String,
        val dapp: ApiDapp,
        val permissions: Permissions,
        val proof: ApiTonConnectProof? = null
    ) : ApiUpdate() {
        @JsonClass(generateAdapter = true)
        data class Permissions(
            val address: Boolean,
            val proof: Boolean
        )
    }

    @JsonSealedSubtype("dappDisconnect")
    @JsonClass(generateAdapter = true)
    data class ApiUpdateDappDisconnect(
        val accountId: String,
        val url: String
    ) : ApiUpdate()

    @JsonSealedSubtype("dappLoading")
    @JsonClass(generateAdapter = true)
    data class ApiUpdateDappLoading(
        val connectionType: ApiConnectionType,
        val isSse: Boolean? = null,
        val accountId: String? = null
    ) : ApiUpdate()

    @JsonSealedSubtype("updateTokens")
    @JsonClass(generateAdapter = true)
    data class ApiUpdateTokens(
        val tokens: Map<String, ApiTokenWithPrice>
    ) : ApiUpdate()

    @JsonSealedSubtype("dappConnectComplete")
    @JsonClass(generateAdapter = true)
    data class ApiUpdateDappConnectComplete(
        val type: String? = null
    ) : ApiUpdate()

    @JsonSealedSubtype("dappCloseLoading")
    @JsonClass(generateAdapter = true)
    data class ApiUpdateDappCloseLoading(
        val type: String? = null
    ) : ApiUpdate()

    @JsonSealedSubtype("updateDapps")
    @JsonClass(generateAdapter = true)
    data class ApiUpdateDapps(
        val type: String? = null
    ) : ApiUpdate()

    @JsonSealedSubtype("initialActivities")
    @JsonClass(generateAdapter = true)
    data class ApiUpdateInitialActivities(
        val accountId: String,
        val chain: MBlockchain,
        val mainActivities: List<MApiTransaction>,
        val bySlug: Map<String, List<MApiTransaction>>
    ) : ApiUpdate()

    @JsonSealedSubtype("updateWalletVersions")
    @JsonClass(generateAdapter = true)
    data class ApiUpdateWalletVersions(
        val accountId: String,
        val currentVersion: String,
        val versions: List<Version>
    ) : ApiUpdate() {
        @JsonClass(generateAdapter = true)
        data class Version(
            val address: String,
            val balance: BigInteger,
            val isInitialized: Boolean,
            val version: String
        )
    }

    @JsonSealedSubtype("updateCurrencyRates")
    @JsonClass(generateAdapter = true)
    data class ApiUpdateCurrencyRates(
        val rates: Map<String, Double>
    ) : ApiUpdate()

    // NOTICE: Do NOT forget to add new sub-types to MoshiBuilder file to prevent minification issues.
}
