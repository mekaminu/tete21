package com.tete21.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/**
 * Picks up the sound other apps are playing (YouTube Music, or any music app) once Android has said yes, and hands
 * it to [MusicHub] 25 times a second. Android only lets this happen in a service that shows a notification; its
 * Stop button ends the share for everyone. Tete's own sound is never picked up, or the table would hear itself.
 */
class MusicService : Service() {
    companion object {
        const val ACTION_START = "com.tete21.app.MUSIC_START"
        const val ACTION_STOP = "com.tete21.app.MUSIC_STOP"
        const val EXTRA_CODE = "code"
        const val EXTRA_DATA = "data"
        const val EXTRA_WHY = "why"
        private const val CHANNEL = "music"
        private const val NOTE_ID = 21
        private const val CHUNK = MusicHub.RATE / 25 * 4 // 40 ms of 48 kHz stereo 16-bit sound, in bytes
    }

    private var projection: MediaProjection? = null
    private var record: AudioRecord? = null
    private var thread: Thread? = null
    @Volatile private var going = false
    private var ended = false
    private var lastStart = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        lastStart = startId
        when (intent?.action) {
            ACTION_START -> {
                if (going) { MusicHub.listener?.onStarted(); return START_NOT_STICKY } // already playing
                ended = false
                val code = intent.getIntExtra(EXTRA_CODE, 0)
                val data: Intent? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
                                    else @Suppress("DEPRECATION") intent.getParcelableExtra(EXTRA_DATA)
                if (data == null) { fail("Android didn't pass on its OK. Try again."); return START_NOT_STICKY }
                // Android wants the notification up before it hands over the sound
                if (!goForeground()) { fail("Android didn't let the music start."); return START_NOT_STICKY }
                begin(code, data)
            }
            ACTION_STOP -> finish(intent.getStringExtra(EXTRA_WHY) ?: "user")
            else -> if (!going) stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun goForeground(): Boolean {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.music_channel), NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
        }
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, MusicService::class.java).setAction(ACTION_STOP).putExtra(EXTRA_WHY, "user"), PendingIntent.FLAG_IMMUTABLE)
        val note = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_note)
            .setContentTitle(getString(R.string.music_on))
            .setContentText(getString(R.string.music_on_text))
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_stop), getString(R.string.stop), stop).build())
            .build()
        // the microphone too, when it's allowed: then your voice still reaches the table while you're in YouTube Music
        val mic = Build.VERSION.SDK_INT >= 30 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val both = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION or (if (mic) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0)
        return try { startForeground(NOTE_ID, note, both); true } catch (_: Exception) {
            try { startForeground(NOTE_ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION); true } catch (_: Exception) { false }
        }
    }

    @SuppressLint("MissingPermission") // the app asks for the microphone before it gets here
    private fun begin(code: Int, data: Intent) {
        val mpm = getSystemService(MediaProjectionManager::class.java)
        val p = try { mpm.getMediaProjection(code, data) } catch (_: Exception) { null }
        if (p == null) { fail("Android didn't share the sound. Try again."); return }
        projection = p
        p.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() { finish("ended") } // stopped from Android's own controls, or the phone locked
        }, Handler(Looper.getMainLooper()))
        val cfg = AudioPlaybackCaptureConfiguration.Builder(p)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .addMatchingUsage(AudioAttributes.USAGE_GAME)
            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
            .excludeUid(applicationInfo.uid) // never Tete's own sound: the table's voices would go round again
            .build()
        val fmt = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(MusicHub.RATE)
            .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
            .build()
        val min = AudioRecord.getMinBufferSize(MusicHub.RATE, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT)
        val rec = try {
            AudioRecord.Builder().setAudioFormat(fmt).setBufferSizeInBytes(maxOf(min * 2, CHUNK * 5)).setAudioPlaybackCaptureConfig(cfg).build()
        } catch (_: SecurityException) { fail("Tete needs the microphone permission to pick up your music."); return }
          catch (e: Exception) { fail("Your music couldn't be picked up (${e.message})."); return }
        if (rec.state != AudioRecord.STATE_INITIALIZED) { rec.release(); fail("Your music couldn't be picked up."); return }
        record = rec
        going = true
        try { rec.startRecording() } catch (e: Exception) { fail("Your music couldn't be picked up (${e.message})."); return }
        thread = Thread({ pump(rec) }, "tete-music").apply { priority = Thread.MAX_PRIORITY; start() }
        MusicHub.running = true
        MusicHub.stopper = { why -> finish(why) }
        MusicHub.listener?.onStarted()
    }

    private fun pump(rec: AudioRecord) {
        while (going) {
            val buf = ByteArray(CHUNK)
            var got = 0
            while (going && got < CHUNK) {
                val n = try { rec.read(buf, got, CHUNK - got) } catch (_: Exception) { -1 }
                if (n < 0) { if (going) Handler(Looper.getMainLooper()).post { fail("Android stopped passing on your music.") }; return }
                got += n
            }
            if (got == CHUNK) MusicHub.listener?.onPcm(buf)
        }
    }

    private fun fail(msg: String) {
        if (ended) return
        MusicHub.listener?.onError(msg)
        finish("error", quiet = true)
    }

    private fun finish(why: String, quiet: Boolean = false) {
        if (ended) return
        ended = true
        val was = MusicHub.running
        going = false
        MusicHub.running = false
        MusicHub.stopper = null
        try { record?.stop() } catch (_: Exception) {}
        try { thread?.join(250) } catch (_: Exception) {}
        try { record?.release() } catch (_: Exception) {}
        record = null; thread = null
        try { projection?.stop() } catch (_: Exception) {}
        projection = null
        try { stopForeground(STOP_FOREGROUND_REMOVE) } catch (_: Exception) {}
        stopSelf(lastStart) // unless it was started again meanwhile
        if (was && !quiet) MusicHub.listener?.onStopped(why)
    }

    override fun onDestroy() {
        finish("ended")
        super.onDestroy()
    }
}
