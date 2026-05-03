# Gangnam Launch Mix

유튜브 링크를 붙여넣어 재생하고, `sound/` 폴더에 넣어둔 사운드를 패드처럼 같이 누를 수 있는 정적 웹앱입니다.

## 실행

브라우저에서 정적 파일로 열어도 되지만, 로컬 서버로 여는 편이 더 안정적입니다.

```bash
python3 -m http.server 8080
```

그 다음 브라우저에서 `http://localhost:8080` 으로 열면 됩니다.

## 지원하는 입력

- `youtube.com/watch?v=...`
- `music.youtube.com/watch?v=...`
- `youtu.be/...`
- `youtube.com/shorts/...`
- 영상 ID 11자리 직접 입력

## 참고

- 재생은 YouTube IFrame Player API를 사용합니다.
- `sound/` 폴더를 바꾸면 현재는 `app.js`의 `SOUNDS` 목록도 같이 맞춰줘야 합니다.
