# รัน Network Sniffer แบบไม่ต้องใช้สิทธิ์ Root เต็มรูปแบบ (เพื่อความปลอดภัย)

## วิธีที่ 1: ใช้ Docker (แนะนำ)
การใช้ Docker ช่วยแยกสภาพแวดล้อมออกจากเซิร์ฟเวอร์หลัก ลดผลกระทบหากโดนเจาะ

```dockerfile
FROM python:3.10-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY real_traffic_sniffer.py .
COPY firebase-key.json .

# รันดักจับเครือข่ายของ Host
CMD ["python", "real_traffic_sniffer.py"]
```
สร้างไฟล์ `Dockerfile` ด้านบน แล้วรันคำสั่งนี้ (สังเกต `--network host`):
`docker build -t ai-sniffer .`
`docker run -d --network host --cap-add=NET_ADMIN --cap-add=NET_RAW ai-sniffer`

## วิธีที่ 2: ใช้ Linux Capabilities (setcap)
อนุญาตให้ Python เปิด Raw Socket ได้โดยไม่ต้องรันด้วยคำสั่ง `sudo python ...`

1. หา path ของ python
`readlink -f $(which python3)`

2. กำหนดสิทธิ์ setcap
`sudo setcap cap_net_raw,cap_net_admin=eip /usr/bin/python3.10`

3. รันสคริปต์แบบ user ธรรมดา
`python3 real_traffic_sniffer.py`
