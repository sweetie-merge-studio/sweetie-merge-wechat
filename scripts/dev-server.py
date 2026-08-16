#!/usr/bin/env python3
"""web-mobile 预览静态服务器：全部响应带 Cache-Control: no-store。
浏览器对同名构建产物（bundle.js / 场景 json）有启发式缓存，
Cocos 构建不带内容 hash，改完代码重新出包后极易执行到旧缓存——统一禁缓存。
用法: python3 scripts/dev-server.py [port] [dir]
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8931
DIR = sys.argv[2] if len(sys.argv) > 2 else 'build/web-mobile'

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *args):
        pass

ThreadingHTTPServer(('127.0.0.1', PORT), partial(NoCacheHandler, directory=DIR)).serve_forever()
