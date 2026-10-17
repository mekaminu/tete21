#!/bin/bash
# runs once the emulated phone is up
mkdir -p out
R=out/result.txt
{
  echo "android: $(adb shell getprop ro.build.version.release) (api $(adb shell getprop ro.build.version.sdk))"
  echo "webview: $(adb shell dumpsys webviewupdate | grep -m1 -i 'Current WebView package' )"
  echo "== install"
  adb install -r apk/tete.apk 2>&1; echo "install exit $?"
  adb shell pm list packages | grep tete
  adb shell dumpsys package com.tete21.app | grep -E "versionName|versionCode|targetSdk" | head -3
  echo "== launch"
  adb logcat -c
  adb shell am start -W -n com.tete21.app/.MainActivity 2>&1
} > $R 2>&1
sleep 30
{
  echo "== after 30s"
  echo "pid: $(adb shell pidof com.tete21.app)"
  adb shell dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity" | head -2
} >> $R 2>&1
adb exec-out screencap -p > out/shot.png
adb logcat -d -v time > out/logcat-full.txt 2>&1
grep -E "AndroidRuntime|FATAL|tete|Tete|chromium|cr_" out/logcat-full.txt | head -300 > out/logcat.txt
gzip -9 out/logcat-full.txt
cat $R
exit 0
