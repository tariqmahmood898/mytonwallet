package org.mytonwallet.app_air.uicreatewallet.viewControllers.importViewWallet

import android.content.Context
import android.text.Editable
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import org.mytonwallet.app_air.uicomponents.base.WViewController
import org.mytonwallet.app_air.uicomponents.commonViews.AddressInputLayout
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.helpers.WFont
import org.mytonwallet.app_air.uicomponents.widgets.WAnimationView
import org.mytonwallet.app_air.uicomponents.widgets.WButton
import org.mytonwallet.app_air.uicomponents.widgets.WLabel
import org.mytonwallet.app_air.uicomponents.widgets.fadeIn
import org.mytonwallet.app_air.uicomponents.widgets.hideKeyboard
import org.mytonwallet.app_air.uicomponents.widgets.setBackgroundColor
import org.mytonwallet.app_air.uicreatewallet.viewControllers.walletAdded.WalletAddedVC
import org.mytonwallet.app_air.walletcontext.globalStorage.WGlobalStorage
import org.mytonwallet.app_air.walletbasecontext.theme.ViewConstants
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color
import org.mytonwallet.app_air.walletbasecontext.utils.toProcessedSpannableStringBuilder
import org.mytonwallet.app_air.walletcore.MAIN_NETWORK
import org.mytonwallet.app_air.walletcore.WalletCore
import org.mytonwallet.app_air.walletcore.WalletEvent
import org.mytonwallet.app_air.walletcore.api.activateAccount
import org.mytonwallet.app_air.walletcore.models.MAccount
import org.mytonwallet.app_air.walletcore.models.MBlockchain
import org.mytonwallet.app_air.walletcore.moshi.api.ApiMethod
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import org.mytonwallet.app_air.walletbasecontext.logger.LogMessage
import org.mytonwallet.app_air.walletbasecontext.logger.Logger
import java.lang.ref.WeakReference

class ImportViewWalletVC(context: Context, private val isOnIntro: Boolean) :
    WViewController(context) {

    override val shouldDisplayTopBar = false

    val animationView = WAnimationView(context).apply {
        play(
            org.mytonwallet.app_air.uicomponents.R.raw.animation_bill, true,
            onStart = {
                fadeIn()
            })
    }

    val titleLabel = WLabel(context).apply {
        setStyle(28f, WFont.Medium)
        text = LocaleController.getString("View Any Address")
        gravity = Gravity.CENTER
        setTextColor(WColor.PrimaryText)
    }

    val subtitleLabel = WLabel(context).apply {
        setStyle(17f, WFont.Regular)
        text = LocaleController.getString("\$import_view_account_note")
            .toProcessedSpannableStringBuilder()
        gravity = Gravity.CENTER
        setTextColor(WColor.PrimaryText)
        setLineHeight(TypedValue.COMPLEX_UNIT_SP, 26f)
    }

    private var address = ""
    private val addressInputView by lazy {
        AddressInputLayout(
            WeakReference(this),
            autoCompleteConfig = AddressInputLayout.AutoCompleteConfig(accountAddresses = false),
            onTextEntered = {
                view.hideKeyboard()
            }).apply {
            id = View.generateViewId()
            setHint(LocaleController.getString("Wallet Address or Domain"))
            setPadding(0, 10.dp, 0, 0)
        }
    }

    private val continueButton = WButton(context).apply {
        text =
            LocaleController.getString("Continue")
        isEnabled = false
        setOnClickListener {
            importPressed()
        }
    }

    private val onInputTextWatcher = object : TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
            address = s.toString()
            continueButton.isEnabled = address.isNotEmpty()
            continueButton.text = LocaleController.getString("Continue")
        }

        override fun afterTextChanged(s: Editable?) {}
    }

    override fun setupViews() {
        super.setupViews()

        setupNavBar(true)
        navigationBar?.addCloseButton()

        view.addView(animationView, ViewGroup.LayoutParams(104.dp, 104.dp))
        view.addView(titleLabel, ViewGroup.LayoutParams(0, WRAP_CONTENT))
        view.addView(subtitleLabel, ViewGroup.LayoutParams(0, WRAP_CONTENT))
        view.addView(addressInputView, ViewGroup.LayoutParams(0, WRAP_CONTENT))
        view.addView(continueButton, ViewGroup.LayoutParams(0, WRAP_CONTENT))
        view.setConstraints {
            toTop(animationView, 22f)
            toCenterX(animationView)
            topToBottom(titleLabel, animationView, 24f)
            toCenterX(titleLabel, 32f)
            topToBottom(subtitleLabel, titleLabel, 20f)
            toCenterX(subtitleLabel, 32f)
            topToBottom(addressInputView, subtitleLabel, 32f)
            toCenterX(addressInputView, 10f)
            constrainMaxHeight(addressInputView.id, 80.dp)
            toCenterX(continueButton, 20f)
            topToTop(continueButton, addressInputView, 112f)
        }

        addressInputView.addTextChangedListener(onInputTextWatcher)

        updateTheme()
    }

    private var cachedHeight = 0
    override val isExpandable = false
    override fun getModalHalfExpandedHeight(): Int? {
        if (cachedHeight > 0)
            return cachedHeight
        titleLabel.measure(
            View.MeasureSpec.makeMeasureSpec(view.width - 64.dp, View.MeasureSpec.AT_MOST),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        )
        subtitleLabel.measure(
            View.MeasureSpec.makeMeasureSpec(view.width - 64.dp, View.MeasureSpec.AT_MOST),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        )

        val titleHeight = titleLabel.measuredHeight.coerceAtLeast(1)
        val subtitleHeight = subtitleLabel.measuredHeight.coerceAtLeast(1)

        cachedHeight = 431.dp + // 416: content + 15: continueButton to bottom
            titleHeight +
            subtitleHeight +
            (navigationController?.getSystemBars()?.bottom ?: 0)
        return cachedHeight
    }

    override fun updateTheme() {
        super.updateTheme()

        view.setBackgroundColor(
            WColor.SecondaryBackground.color,
            ViewConstants.BIG_RADIUS.dp,
            0f
        )
        addressInputView.setBackgroundColor(
            WColor.Background.color,
            ViewConstants.BIG_RADIUS.dp
        )
    }

    override fun onDestroy() {
        super.onDestroy()

        addressInputView.removeTextChangedListener(onInputTextWatcher)
    }

    private fun importPressed() {
        val address = addressInputView.getAddress() ?: return
        val addressByChain = mutableMapOf<MBlockchain, String>()
        val blockchain = if (address.startsWith("T")) MBlockchain.tron else MBlockchain.ton
        addressByChain[blockchain] = address
        view.lockView()
        continueButton.isLoading = true
        WalletCore.call(
            ApiMethod.Auth.ImportViewAccount(MAIN_NETWORK, addressByChain),
            callback = { result, error ->
                if (result == null || error != null) {
                    view.unlockView()
                    continueButton.isLoading = false
                    continueButton.isEnabled = false
                    continueButton.text =
                        error?.parsed?.toShortLocalized ?: LocaleController.getString("Continue")
                    return@call
                }
                Logger.d(
                    Logger.LogTag.ACCOUNT,
                    LogMessage.Builder()
                        .append(
                            result.accountId,
                            LogMessage.MessagePartPrivacy.PUBLIC
                        )
                        .append(
                            "Imported, View",
                            LogMessage.MessagePartPrivacy.PUBLIC
                        )
                        .append(
                            "Address: ${result.byChain}",
                            LogMessage.MessagePartPrivacy.REDACTED
                        ).build()
                )
                WGlobalStorage.addAccount(
                    accountId = result.accountId,
                    accountType = MAccount.AccountType.VIEW.value,
                    address = result.byChain["ton"]?.address,
                    tronAddress = result.byChain["tron"]?.address,
                    importedAt = null
                )
                WalletCore.activateAccount(
                    accountId = result.accountId,
                    notifySDK = false
                ) { _, err ->
                    if (err != null) {
                        return@activateAccount
                    }
                    if (isOnIntro) {
                        handlePush(WalletAddedVC(context, false), {
                            navigationController?.removePrevViewControllers()
                        })
                    } else {
                        WalletCore.notifyEvent(WalletEvent.AddNewWalletCompletion)
                        window!!.dismissLastNav()
                    }
                }
            })
    }

    private fun handlePush(viewController: WViewController, onCompletion: (() -> Unit)? = null) {
        window?.dismissLastNav {
            window?.navigationControllers?.lastOrNull()
                ?.push(viewController, onCompletion = onCompletion)
        }
    }
}
