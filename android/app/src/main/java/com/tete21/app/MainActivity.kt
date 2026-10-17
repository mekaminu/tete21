package com.tete21.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.media.AudioManager
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import android.view.KeyEvent
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.MimeTypeMap
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebMessagePortCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * Tete 21 for Android: the game itself is the web app (https://tete21.onrender.com), shown full screen. The app adds
 * what a web page can't do on a phone: playing the music from YouTube Music (or any music app) for the whole table.
 * The page talks to it as window.TeteAndroid (hello, startMusic, stopMusic, share, version); the sound itself goes
 * over a message port, 48 kHz stereo 16-bit, both ways: your music to the page, and while it's shared, the table's
 * sound back to be played here (see [TableSound]).
 */
class MainActivity : ComponentActivity(), MusicHub.Listener {
    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private val main = Handler(Looper.getMainLooper())
    private val audioThread = HandlerThread("tete-audio").apply { start() }
    private val audio = Handler(audioThread.looper)
    private val home: Uri = Uri.parse(BuildConfig.TETE_URL)
    private val out = TableSound()

    @Volatile private var port: WebMessagePortCompat? = null
    @Volatile private var bin = false     // can the page and the app pass raw bytes (or only text)?
    @Volatile private var quiet = false   // is the page muted, with the table's sound playing here instead?
    private var permFor = ""
    private var webAsk: PermissionRequest? = null
    private var files: ValueCallback<Array<Uri>>? = null

    private val askPerms = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { onPerms() }
    private val askShare = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { onShareAnswer(it) }
    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { onFiles(it) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
        root = FrameLayout(this).apply { setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.night)) }
        setContentView(root)
        // the page sits between the status bar and the navigation bar (and above the keyboard)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }
        volumeControlStream = AudioManager.STREAM_MUSIC
        MusicHub.listener = this
        makeWeb()
        web.loadUrl(linkIn(intent) ?: BuildConfig.TETE_URL)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            // back never closes the table: it goes back a page, or puts Tete in the background
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else moveTaskToBack(true) }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        linkIn(intent)?.let { web.loadUrl(it) }
    }

    private fun linkIn(i: Intent?): String? {
        val u = i?.data ?: return null
        return if (i.action == Intent.ACTION_VIEW && isTete(u)) u.toString() else null
    }

    private fun isTete(u: Uri?) = u != null && u.scheme == "https" && u.host == home.host

    private fun onTete(): Boolean = web.url?.let { isTete(Uri.parse(it)) } == true

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun makeWeb() {
        web = WebView(this)
        web.setBackgroundColor(ContextCompat.getColor(this, R.color.night))
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = "$userAgentString TeteAndroid/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        // keep the page lively in the background too (your voice and the music carry on while you're in another app)
        web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
        web.addJavascriptInterface(Bridge(), "TeteAndroid")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (isTete(request.url)) return false
                openOutside(request.url)
                return true
            }
            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                // a new page means the old table is gone: so is any music it was playing
                stopMusic("page")
                port?.let { try { it.close() } catch (_: Exception) {} }
                port = null
            }
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // the page's process was closed (short of memory, say): start again rather than close the app
                stopMusic("ended")
                root.removeView(web)
                web.destroy()
                makeWeb()
                web.loadUrl(BuildConfig.TETE_URL)
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) { main.post { webPermission(request) } }
            override fun onPermissionRequestCanceled(request: PermissionRequest) { if (webAsk == request) webAsk = null }
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean = chooseFiles(cb, params)
        }
        web.setDownloadListener { url, _, _, _, _ -> openOutside(Uri.parse(url)) }
    }

    // ----- what the page can ask for -----
    inner class Bridge {
        @JavascriptInterface fun hello() { main.post { if (onTete()) sendPort() } }
        @JavascriptInterface fun startMusic() { main.post { if (onTete()) startMusicAsk() } }
        @JavascriptInterface fun stopMusic() { main.post { this@MainActivity.stopMusic("page") } }
        @JavascriptInterface fun share(title: String?, text: String?, url: String?) { main.post { if (onTete()) shareText(title, text, url) } }
        @JavascriptInterface fun version(): String = BuildConfig.VERSION_NAME
    }

    /** A message channel to the page: the sound goes over it (bytes if the phone's WebView can, text if not). */
    private fun sendPort() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.CREATE_WEB_MESSAGE_CHANNEL) ||
            !WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE)) return
        port?.let { try { it.close() } catch (_: Exception) {} }
        val ch = WebViewCompat.createWebMessageChannel(web)
        bin = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER)
        ch[0].setWebMessageCallback(audio, object : WebMessagePortCompat.WebMessageCallbackCompat() {
            override fun onMessage(p: WebMessagePortCompat, message: WebMessageCompat?) { fromPage(message) }
        })
        port = ch[0]
        val origin = Uri.Builder().scheme("https").authority(home.host).build()
        WebViewCompat.postWebMessage(web, WebMessageCompat("tete-music-port", arrayOf(ch[1])), origin)
    }

    /** From the page, on the sound thread: the table's sound to play here while the page is muted. */
    private fun fromPage(m: WebMessageCompat?) {
        if (m == null) return
        try {
            if (bin && m.type == WebMessageCompat.TYPE_ARRAY_BUFFER) { if (quiet) out.write(m.arrayBuffer); return }
            val s = m.data ?: return
            when {
                s.startsWith("b64:") -> if (quiet) out.write(Base64.decode(s.substring(4), Base64.DEFAULT))
                s == "tete:out-off" -> main.post { quietPage(false) } // the page couldn't mix the table's sound: it plays it itself
            }
        } catch (_: Exception) {}
    }

    // ----- your music for the table -----
    private fun startMusicAsk() {
        if (MusicHub.running) { musicStarted(); return }
        val need = mutableListOf<String>()
        if (!has(Manifest.permission.RECORD_AUDIO)) need += Manifest.permission.RECORD_AUDIO
        if (Build.VERSION.SDK_INT >= 33 && !has(Manifest.permission.POST_NOTIFICATIONS)) need += Manifest.permission.POST_NOTIFICATIONS
        if (need.isNotEmpty()) { permFor = "music"; askPerms.launch(need.toTypedArray()); return }
        askAndroid()
    }

    private fun askAndroid() {
        val mpm = getSystemService(MediaProjectionManager::class.java)
        // the whole screen: Android only passes on other apps' sound that way (Tete never looks at the screen)
        val i = if (Build.VERSION.SDK_INT >= 34) mpm.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
                else mpm.createScreenCaptureIntent()
        try { askShare.launch(i) } catch (e: Exception) { musicEvent("error", "Android couldn't ask you (${e.message}).") }
    }

    private fun onShareAnswer(r: ActivityResult) {
        val data = r.data
        if (r.resultCode != RESULT_OK || data == null) { musicEvent("denied", ""); return }
        val i = Intent(this, MusicService::class.java)
            .setAction(MusicService.ACTION_START)
            .putExtra(MusicService.EXTRA_CODE, r.resultCode)
            .putExtra(MusicService.EXTRA_DATA, data)
        try { ContextCompat.startForegroundService(this, i) } catch (e: Exception) { musicEvent("error", "Android didn't let the music start (${e.message}).") }
    }

    private fun musicStarted() {
        // mute the page and play the table here instead, so Android never pauses your music for the page's voices
        val canMute = WebViewFeature.isFeatureSupported(WebViewFeature.MUTE_AUDIO)
        if (canMute) quietPage(true)
        musicEvent("started", "", canMute)
        // and if your music app was paused for the table's sound before you started, it plays again
        main.postDelayed({ if (MusicHub.running) playOtherMusic() }, 700)
    }

    private fun quietPage(on: Boolean) {
        if (on == quiet) return
        if (on) out.start()
        quiet = on
        if (!on) out.stop()
        try { if (WebViewFeature.isFeatureSupported(WebViewFeature.MUTE_AUDIO)) WebViewCompat.setAudioMuted(web, on) } catch (_: Exception) {}
    }

    /** Presses "play" for the music app that played last (a no-op if it's already playing). */
    private fun playOtherMusic() {
        val am = getSystemService(AudioManager::class.java)
        val t = SystemClock.uptimeMillis()
        try {
            am.dispatchMediaKeyEvent(KeyEvent(t, t, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY, 0))
            am.dispatchMediaKeyEvent(KeyEvent(t, t, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY, 0))
        } catch (_: Exception) {}
    }

    private fun stopMusic(why: String) {
        quietPage(false)
        if (MusicHub.running) {
            try { startService(Intent(this, MusicService::class.java).setAction(MusicService.ACTION_STOP).putExtra(MusicService.EXTRA_WHY, why)) } catch (_: Exception) {}
        }
    }

    private fun musicEvent(type: String, why: String, out: Boolean = false) {
        val ev = JSONObject().put("type", type).put("why", why).put("msg", why).put("out", out).put("bin", bin)
        web.evaluateJavascript("window.__teteMusicEvent&&window.__teteMusicEvent($ev)", null)
    }

    // from the music service
    override fun onPcm(buf: ByteArray) {
        val p = port ?: return
        try { p.postMessage(if (bin) WebMessageCompat(buf) else WebMessageCompat(Base64.encodeToString(buf, Base64.NO_WRAP))) } catch (_: Exception) {}
    }
    override fun onStarted() { main.post { musicStarted() } }
    override fun onStopped(why: String) { main.post { quietPage(false); musicEvent("stopped", why) } }
    override fun onError(msg: String) { main.post { quietPage(false); musicEvent("error", msg) } }

    // ----- the microphone and camera for voice and video -----
    private fun webPermission(req: PermissionRequest) {
        if (!isTete(req.origin)) { req.deny(); return }
        val want = mutableListOf<String>()
        if (req.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) want += Manifest.permission.RECORD_AUDIO
        if (req.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) want += Manifest.permission.CAMERA
        val missing = want.filter { !has(it) }
        if (missing.isEmpty()) { grantWeb(req); return }
        webAsk?.deny()
        webAsk = req
        permFor = "web"
        askPerms.launch(missing.toTypedArray())
    }

    private fun grantWeb(req: PermissionRequest) {
        val ok = req.resources.filter {
            (it == PermissionRequest.RESOURCE_AUDIO_CAPTURE && has(Manifest.permission.RECORD_AUDIO)) ||
            (it == PermissionRequest.RESOURCE_VIDEO_CAPTURE && has(Manifest.permission.CAMERA))
        }
        if (ok.isEmpty()) req.deny() else req.grant(ok.toTypedArray())
    }

    private fun onPerms() {
        when (permFor) {
            "web" -> { val r = webAsk; webAsk = null; if (r != null) grantWeb(r) }
            "music" -> if (has(Manifest.permission.RECORD_AUDIO)) askAndroid() else musicEvent("denied", "")
        }
        permFor = ""
    }

    private fun has(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    // ----- picking files (songs from your phone) -----
    private fun chooseFiles(cb: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
        files?.onReceiveValue(null)
        files = cb
        val types = params.acceptTypes.flatMap { it.split(',') }.map { it.trim() }.filter { it.isNotEmpty() }
        val mimes = types.map { t -> if (t.startsWith(".")) MimeTypeMap.getSingleton().getMimeTypeFromExtension(t.drop(1)) ?: "*/*" else t }.distinct()
        val i = Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE)
        i.type = if (mimes.size == 1) mimes[0] else "*/*"
        if (mimes.size > 1) i.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toTypedArray())
        if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        return try { pickFiles.launch(i); true } catch (_: Exception) { files = null; false }
    }

    private fun onFiles(r: ActivityResult) {
        val cb = files ?: return
        files = null
        val d = r.data
        val picked: Array<Uri>? = if (r.resultCode != RESULT_OK || d == null) null else {
            val c = d.clipData
            if (c != null && c.itemCount > 0) Array(c.itemCount) { c.getItemAt(it).uri } else d.data?.let { arrayOf(it) }
        }
        cb.onReceiveValue(picked)
    }

    // ----- sharing invites and links -----
    private fun shareText(title: String?, text: String?, url: String?) {
        val t = text?.trim().orEmpty()
        val u = url?.trim().orEmpty()
        val body = if (u.isNotEmpty() && !t.contains(u)) (if (t.isEmpty()) u else "$t\n$u") else t
        if (body.isEmpty()) return
        val i = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, body)
        if (!title.isNullOrBlank()) i.putExtra(Intent.EXTRA_SUBJECT, title)
        try { startActivity(Intent.createChooser(i, getString(R.string.share))) } catch (_: Exception) {}
    }

    private fun openOutside(u: Uri) {
        if (u.scheme == "intent") {
            val i = try { Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME) } catch (_: Exception) { null } ?: return
            i.addCategory(Intent.CATEGORY_BROWSABLE)
            i.component = null
            i.selector = null
            try { startActivity(i) } catch (_: ActivityNotFoundException) {
                i.getStringExtra("browser_fallback_url")?.let { f -> Uri.parse(f).takeIf { it.scheme == "https" }?.let { openOutside(it) } }
            }
            return
        }
        try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: ActivityNotFoundException) {}
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush() // stay signed in
        // the page keeps running: your voice and the music go on while you're in another app
    }

    override fun onDestroy() {
        stopMusic("ended")
        if (MusicHub.listener === this) MusicHub.listener = null
        port?.let { try { it.close() } catch (_: Exception) {} }
        port = null
        web.destroy()
        audioThread.quitSafely()
        super.onDestroy()
    }
}
