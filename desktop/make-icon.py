"""把用户给的图标处理成 Electron/Windows 需要的 png + ico。

源图是「深色圆角方块 + 纯白背景」，直接拿去当图标会在任务栏里显示一个白框。
这里做两件事：
  1. 裁掉四周白边，让圆角方块铺满画布；
  2. 从四角做 flood fill 把圆角外的白色变透明（内部文字也是白色，不能整体抠白）。
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = r"C:\Users\Administrator\.dsh\attachments\v1\objects\0b\0b67a90e92efd793fcb74858f30dc4e94aeb09ae4f43325434608e81ed7d1ae7"
OUT_DIR = os.path.join(HERE, "build")
os.makedirs(OUT_DIR, exist_ok=True)

img = Image.open(SRC).convert("RGBA")
print("源图尺寸:", img.size)

# 1) 裁掉外部白边：找到「非接近白」像素的包围盒
gray = img.convert("L")
mask = gray.point(lambda v: 255 if v < 240 else 0)
bbox = mask.getbbox()
print("非白区域 bbox:", bbox)
if bbox:
    # 留一点余量，避免把圆角边缘切掉
    pad = 2
    img = img.crop(
        (
            max(0, bbox[0] - pad),
            max(0, bbox[1] - pad),
            min(img.width, bbox[2] + pad),
            min(img.height, bbox[3] + pad),
        )
    )
    print("裁剪后尺寸:", img.size)

# 2) 四角 flood fill 去白底（只影响与四角连通的白色区域，内部的白色文字保留）
w, h = img.size
for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
    if img.getpixel(corner)[:3] >= (235, 235, 235):
        ImageDraw.floodfill(img, corner, (0, 0, 0, 0), thresh=28)

# 3) 正方形画布（图标必须正方），居中贴到透明底上
side = max(img.size)
canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)

png_path = os.path.join(OUT_DIR, "icon.png")
canvas.resize((1024, 1024), Image.LANCZOS).save(png_path)
print("已写出:", png_path)

ico_path = os.path.join(OUT_DIR, "icon.ico")
canvas.save(
    ico_path,
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print("已写出:", ico_path, os.path.getsize(ico_path), "字节")

# 顺便给前端 public 放一份，网页 favicon 也能用
pub = os.path.join(HERE, "..", "frontend", "public", "logo.png")
os.makedirs(os.path.dirname(pub), exist_ok=True)
canvas.resize((512, 512), Image.LANCZOS).save(pub)
print("已写出:", os.path.normpath(pub))
