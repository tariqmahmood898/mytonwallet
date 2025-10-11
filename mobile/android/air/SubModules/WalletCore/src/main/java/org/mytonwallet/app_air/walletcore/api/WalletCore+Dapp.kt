package org.mytonwallet.app_air.walletcore.api

import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.mytonwallet.app_air.walletcore.JSWebViewBridge
import org.mytonwallet.app_air.walletcore.WalletCore
import org.mytonwallet.app_air.walletcore.WalletEvent
import org.mytonwallet.app_air.walletcore.models.MBridgeError
import org.mytonwallet.app_air.walletcore.models.MExploreCategory
import org.mytonwallet.app_air.walletcore.models.MExploreSite
import org.mytonwallet.app_air.walletcore.moshi.api.ApiMethod
import org.mytonwallet.app_air.walletcore.stores.AccountStore
import org.mytonwallet.app_air.walletcore.stores.DappsStore
import java.util.concurrent.Executors

fun WalletCore.loadExploreSites(
    callback: (Array<MExploreCategory>?, sites: Array<MExploreSite>?, MBridgeError?) -> Unit
) {
    bridge?.callApi(
        "loadExploreSites",
        "[{\"langCode\": \"en\", \"isLandscape\": false}]"
    ) { result, error ->
        if (error != null || result == null) {
            callback(null, null, error)
        } else {
            val executor = Executors.newSingleThreadExecutor()
            executor.run {
                try {
                    val exploreSitesJSONObject = JSONObject(result)
                    val exploreSites = ArrayList<MExploreSite>()
                    val exploreSitesJSONArray = exploreSitesJSONObject.getJSONArray("sites")
                    for (index in 0..<exploreSitesJSONArray.length()) {
                        val exploreSiteObj = exploreSitesJSONArray.getJSONObject(index)
                        val exploreSite = MExploreSite(exploreSiteObj)
                        exploreSites.add(exploreSite)
                    }
                    val categories = ArrayList<MExploreCategory>()
                    val categoriesJSONArray = exploreSitesJSONObject.getJSONArray("categories")
                    for (index in 0..<categoriesJSONArray.length()) {
                        val categoryObj = categoriesJSONArray.getJSONObject(index)
                        val exploreCategory = MExploreCategory(categoryObj, exploreSites)
                        categories.add(exploreCategory)
                    }
                    Handler(Looper.getMainLooper()).post {
                        callback(categories.toTypedArray(), exploreSites.toTypedArray(), null)
                    }
                } catch (e: Error) {
                    Handler(Looper.getMainLooper()).post {
                        callback(null, null, null)
                    }
                }
            }
        }
    }
}

fun WalletCore.requestDAppList() {
    val accountId = AccountStore.activeAccountId ?: return
    CoroutineScope(Dispatchers.Main).launch {
        try {
            val apps = call(ApiMethod.DApp.GetDapps(accountId))
            DappsStore.setDapps(accountId, apps)
            notifyEvent(WalletEvent.DappsCountUpdated)
        } catch (e: JSWebViewBridge.ApiError) {
            // todo: repeat request
        }
    }
}
