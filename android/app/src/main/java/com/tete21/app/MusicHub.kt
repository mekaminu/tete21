package com.tete21.app

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack

/**
 * Where the music share's pieces meet. [MusicService] picks up the sound other apps are playing (YouTube Music, say)
 * and hands it here; [MainActivity] passes it to the web page, which sends it to everyone at the table.
 */
object MusicHub {
    const val RATE = 48000

    interface Listener {
        /** 40 ms of captured sound: 48 kHz, stereo, 16-bit. Called on the capture thread. */
        fun onPcm(buf: ByteArray)
        fun onStarted()
        fun onStopped(why: String)
        fun onError(msg: String)
    }

    @Volatile var listener: Listener? = null
    @Volatile var running = false
}

/**
 * The table's sound, played here while your music is shared. The app mutes its web page then, because Android
 * pauses YouTube Music whenever a web page starts playing voices; the page mixes everyone's voices and the game's
 * sounds and sends them over instead. This player asks Android for nothing, so YouTube Music keeps playing, and
 * it's kept out of what the music share picks up (no other app may record it, and the share skips Tete's own sound).
 */
class TableSound {
    private var track: AudioTrack? = null
    private var playing = false
    private var queued = 0
    private val head = MusicHub.RATE * 4 / 10 // start once 100 ms is in hand, so an uneven arrival doesn't crackle

    @Synchronized fun start() {
        if (track != null) return
        val min = AudioTrack.getMinBufferSize(MusicHub.RATE, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT)
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .setAllowedCapturePolicy(AudioAttributes.ALLOW_CAPTURE_BY_SYSTEM)
            .build()
        val fmt = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(MusicHub.RATE)
            .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
            .build()
        val t = try {
            AudioTrack.Builder()
                .setAudioAttributes(attrs)
                .setAudioFormat(fmt)
                .setBufferSizeInBytes(maxOf(min * 2, MusicHub.RATE * 4 / 5)) // about 200 ms
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
        } catch (e: Exception) { null } ?: return
        if (t.state != AudioTrack.STATE_INITIALIZED) { t.release(); return }
        track = t
        playing = false
        queued = 0
    }

    /** Never waits: if the player is already full, the extra is dropped, which keeps the delay short. */
    @Synchronized fun write(b: ByteArray) {
        val t = track ?: return
        try {
            val n = t.write(b, 0, b.size, AudioTrack.WRITE_NON_BLOCKING)
            if (!playing && n > 0) { queued += n; if (queued >= head) { t.play(); playing = true } }
        } catch (_: Exception) {}
    }

    @Synchronized fun stop() {
        val t = track ?: return
        track = null
        try { t.pause(); t.flush() } catch (_: Exception) {}
        try { t.release() } catch (_: Exception) {}
    }

    val on: Boolean @Synchronized get() = track != null
}
