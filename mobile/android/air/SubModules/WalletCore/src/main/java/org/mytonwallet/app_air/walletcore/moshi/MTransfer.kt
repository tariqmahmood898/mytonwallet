package org.mytonwallet.app_air.walletcore.moshi

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import java.math.BigInteger

@JsonClass(generateAdapter = true)
data class MTonTransferParams(
    val toAddress: String,
    val amount: BigInteger,
    val payload: String?,
    val stateInit: String?,
    val isBase64Payload: Boolean?
)

@JsonClass(generateAdapter = true)
data class MApiSubmitMultiTransferResult(
    val messages: List<MTonTransferParams>? = null,
    val amount: String?,
    val seqno: Int?,
    val boc: String?,
    val msgHash: String?,
    val paymentLink: String?
)

@JsonClass(generateAdapter = true)
data class MApiCheckTransactionDraftOptions(
    val accountId: String,
    val toAddress: String,
    val amount: BigInteger,
    val tokenAddress: String?,
    val data: String?, // Accepts String, ByteArray, or Cell
    val stateInit: String?,
    val shouldEncrypt: Boolean?,
    val isBase64Data: Boolean?,
    val allowGasless: Boolean?
)

@JsonClass(generateAdapter = true)
data class MApiCheckTransactionDraftResult(
    val fee: BigInteger?,
    val realFee: BigInteger?,
    val addressName: String?,
    val isScam: Boolean?,
    val resolvedAddress: String?,
    val isToAddressNew: Boolean?,
    val isBounceable: Boolean?,
    val isMemoRequired: Boolean?,
    val error: MApiAnyDisplayError?,
    val diesel: MTransferDiesel?
)

@JsonClass(generateAdapter = true)
data class MApiCheckStakeDraftResult(
    val fee: BigInteger?,
    val realFee: BigInteger?,
    val addressName: String?,
    val isScam: Boolean?,
    val resolvedAddress: String?,
    val isToAddressNew: Boolean?,
    val isBounceable: Boolean?,
    val isMemoRequired: Boolean?,
    val error: MApiAnyDisplayError?,
    val diesel: MTransferDiesel?,
    val tokenAmount: BigInteger,
)

@JsonClass(generateAdapter = true)
data class MTransferDiesel(
    override val status: MDieselStatus?,
    override val shouldPrefer: Boolean?,
    override val realFee: BigInteger?,
    override val remainingFee: BigInteger?,
    override val nativeAmount: BigInteger?,
    val amount: BigInteger?,
) : IDiesel {
    override val tokenAmount: BigInteger?
        get() = amount

    override val starsAmount: BigInteger?
        get() = null
}

@JsonClass(generateAdapter = true)
data class MSwapDiesel(
    override val status: MDieselStatus?,
    override val shouldPrefer: Boolean?,
    override val realFee: BigInteger?,
    override val remainingFee: BigInteger?,
    override val nativeAmount: BigInteger?,
    val amount: MDieselAmount?,
) : IDiesel {
    override val tokenAmount: BigInteger?
        get() = amount?.token

    override val starsAmount: BigInteger?
        get() = amount?.stars
}

interface IDiesel {
    val status: MDieselStatus?
    val shouldPrefer: Boolean?
    val realFee: BigInteger?
    val remainingFee: BigInteger?
    val nativeAmount: BigInteger?

    val tokenAmount: BigInteger?
    val starsAmount: BigInteger?
}

data class MDieselAmount(
    val token: BigInteger?,
    val stars: BigInteger?
)

@JsonClass(generateAdapter = true)
data class MApiSubmitTransferOptions(
    val accountId: String,
    val password: String,
    val toAddress: String,
    val amount: BigInteger,
    val comment: String? = null,
    val tokenAddress: String? = null,
    /** To cap the fee in TRON transfers */
    val fee: BigInteger? = null,
    /** To show in the created local transaction */
    val realFee: BigInteger? = null,
    val shouldEncrypt: Boolean? = null,
    val isBase64Data: Boolean? = null,
    val withDiesel: Boolean? = null,
    val dieselAmount: BigInteger? = null,
    val stateInit: String? = null,
    val isGaslessWithStars: Boolean? = null,
    val noFeeCheck: Boolean? = false
)

sealed class MApiSubmitTransferResult {
    abstract val toAddress: String?
    abstract val amount: BigInteger

    @JsonClass(generateAdapter = true)
    data class Ton(
        override val toAddress: String?,
        override val amount: BigInteger,
        val seqno: Int,
        val msgHash: String,
        val encryptedComment: String? = null
    ) : MApiSubmitTransferResult()

    @JsonClass(generateAdapter = true)
    data class Tron(
        override val toAddress: String?,
        override val amount: BigInteger,
        val txId: String
    ) : MApiSubmitTransferResult()
}

@JsonClass(generateAdapter = false)
enum class MDieselStatus {
    @Json(name = "not-available")
    NOT_AVAILABLE,

    @Json(name = "not-authorized")
    NOT_AUTHORIZED,

    @Json(name = "pending-previous")
    PENDING_PREVIOUS,

    @Json(name = "available")
    AVAILABLE,

    @Json(name = "stars-fee")
    STARS_FEE
}

@JsonClass(generateAdapter = false)
enum class MApiAnyDisplayError {
    @Json(name = "Unexpected")
    UNEXPECTED,

    @Json(name = "ServerError")
    SERVER_ERROR,

    @Json(name = "DebugError")
    DEBUG_ERROR,

    @Json(name = "UnsupportedVersion")
    UNSUPPORTED_VERSION,

    @Json(name = "InvalidMnemonic")
    INVALID_MNEMONIC,

    @Json(name = "InvalidAmount")
    INVALID_AMOUNT,

    @Json(name = "InvalidToAddress")
    INVALID_TO_ADDRESS,

    @Json(name = "InsufficientBalance")
    INSUFFICIENT_BALANCE,

    @Json(name = "InvalidStateInit")
    INVALID_STATE_INIT,

    @Json(name = "StateInitWithoutBin")
    STATE_INIT_WITHOUT_BIN,

    @Json(name = "DomainNotResolved")
    DOMAIN_NOT_RESOLVED,

    @Json(name = "WalletNotInitialized")
    WALLET_NOT_INITIALIZED,

    @Json(name = "InvalidAddressFormat")
    INVALID_ADDRESS_FORMAT,

    @Json(name = "InactiveContract")
    INACTIVE_CONTRACT,

    @Json(name = "PartialTransactionFailure")
    PARTIAL_TRANSACTION_FAILURE,

    @Json(name = "IncorrectDeviceTime")
    INCORRECT_DEVICE_TIME,

    @Json(name = "UnsuccesfulTransfer")
    UNSUCCESSFUL_TRANSFER,

    @Json(name = "NotSupportedHardwareOperation")
    NOT_SUPPORTED_HARDWARE_OPERATION,

    @Json(name = "HardwareBlindSigningNotEnabled")
    HARDWARE_BLIND_SIGNING_NOT_ENABLED,

    @Json(name = "WrongAddress")
    WRONG_ADDRESS,

    @Json(name = "WrongNetwork")
    WRONG_NETWORK;

    val toErrorDialogMessage: String?
        get() {
            return LocaleController.getStringOrNull(
                when (this) {
                    UNEXPECTED -> "Unexpected"
                    // SERVER_ERROR -> if (WalletCore.isConnected())
                    //         "An error on the server side. Please try again."
                    //     else
                    //         "No internet connection. Please check your connection and try again."
                    DEBUG_ERROR -> "Unexpected error. Please let the support know."
                    // UNSUPPORTED_VERSION -> null
                    INVALID_MNEMONIC -> "InvalidMnemonic"
                    INVALID_AMOUNT -> "Invalid amount"
                    // INVALID_TO_ADDRESS -> "Invalid address"
                    // INSUFFICIENT_BALANCE -> "Insufficient balance"
                    INVALID_STATE_INIT -> "\$state_init_invalid"
                    STATE_INIT_WITHOUT_BIN -> "State init supplied without message body" // likely?
                    // DOMAIN_NOT_RESOLVED -> "Domain is not connected to a wallet"
                    WALLET_NOT_INITIALIZED -> "Encryption is not possible. The recipient is not a wallet or has no outgoing transactions."
                    INVALID_ADDRESS_FORMAT -> "Invalid address format. Only URL Safe Base64 format is allowed."
                    INACTIVE_CONTRACT -> "\$transfer_inactive_contract_error"
                    PARTIAL_TRANSACTION_FAILURE -> "Not all transactions were sent successfully"
                    INCORRECT_DEVICE_TIME -> "The time on your device is incorrect, sync it and try again"
                    UNSUCCESSFUL_TRANSFER -> "Transfer was unsuccessful. Try again later."
                    NOT_SUPPORTED_HARDWARE_OPERATION -> "\$ledger_outdated" // most likely
                    HARDWARE_BLIND_SIGNING_NOT_ENABLED -> "\$hardware_blind_sign_not_enabled_internal"
                    WRONG_ADDRESS -> "WrongAddress"
                    WRONG_NETWORK -> "WrongNetwork"
                    else -> null
                }
            )
        }

}
