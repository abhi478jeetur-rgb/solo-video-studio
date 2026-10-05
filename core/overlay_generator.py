import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def hex_to_rgba(h, alpha=255):
    if not h or h == 'transparent':
        return (0, 0, 0, 0)
    h = str(h).strip().lstrip('#')
    if len(h) == 6:
        r, g, b = tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
        return (r, g, b, alpha)
    elif len(h) == 8:
        r, g, b, a = tuple(int(h[i:i+2], 16) for i in (0, 2, 4, 6))
        return (r, g, b, a)
    return (0, 0, 0, alpha)

def get_system_font(bold=True, size=24):
    font_paths = [
        'C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf',
        'C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf',
        'C:/Windows/Fonts/calibrib.ttf' if bold else 'C:/Windows/Fonts/calibri.ttf',
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size)
            except Exception:
                pass
    return ImageFont.load_default()

def draw_verified_badge(size=24):
    """Generates an ultra-crisp Twitter/Instagram scalloped blue verified checkmark badge."""
    render_scale = 4
    s = size * render_scale
    badge = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(badge)
    
    cx, cy = s / 2.0, s / 2.0
    r = s * 0.44
    
    # Outer circle base
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(29, 161, 242, 255))
    
    # Scalloped petals
    num_petals = 12
    petal_r = s * 0.15
    for i in range(num_petals):
        angle = (2 * math.pi * i) / num_petals
        px = cx + (r * 0.88) * math.cos(angle)
        py = cy + (r * 0.88) * math.sin(angle)
        d.ellipse([px - petal_r, py - petal_r, px + petal_r, py + petal_r], fill=(29, 161, 242, 255))
    
    # White checkmark
    pts = [
        (s * 0.28, s * 0.52),
        (s * 0.44, s * 0.68),
        (s * 0.74, s * 0.35)
    ]
    lw = max(4, int(s * 0.09))
    d.line([pts[0], pts[1]], fill=(255, 255, 255, 255), width=lw)
    d.line([pts[1], pts[2]], fill=(255, 255, 255, 255), width=lw)
    
    # Smooth downsample
    return badge.resize((size, size), Image.Resampling.LANCZOS)

def create_circular_avatar(image_or_path, diameter=64, ring_color="#FF6B00", ring_width=3):
    """Crops an image into a circle with an outer ring border."""
    try:
        if isinstance(image_or_path, str) and os.path.isfile(image_or_path):
            img = Image.open(image_or_path).convert('RGBA')
        elif isinstance(image_or_path, Image.Image):
            img = image_or_path.convert('RGBA')
        else:
            # Fallback default logo with 'SV' initials or silhouette
            img = Image.new('RGBA', (diameter, diameter), (255, 248, 240, 255))
            d = ImageDraw.Draw(img)
            f = get_system_font(bold=True, size=int(diameter * 0.45))
            bbox = f.getbbox("SV")
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            d.text(((diameter - tw) / 2, (diameter - th) / 2 - bbox[1]), "SV", font=f, fill=(233, 87, 34, 255))
    except Exception:
        img = Image.new('RGBA', (diameter, diameter), (233, 87, 34, 255))

    render_scale = 3
    s = diameter * render_scale
    rw = ring_width * render_scale
    
    # Resize input image to fit inside ring
    inner_d = s - (rw * 2)
    img_ratio = img.width / float(img.height)
    if img_ratio > 1:
        new_h = inner_d
        new_w = int(inner_d * img_ratio)
    else:
        new_w = inner_d
        new_h = int(inner_d / img_ratio)
    img_resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Crop center square
    left = (new_w - inner_d) // 2
    top = (new_h - inner_d) // 2
    cropped = img_resized.crop((left, top, left + inner_d, top + inner_d))
    
    # Circle mask for avatar
    avatar_canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    mask = Image.new('L', (inner_d, inner_d), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse([0, 0, inner_d - 1, inner_d - 1], fill=255)
    
    avatar_canvas.paste(cropped, (rw, rw), mask)
    
    # Outer ring
    d = ImageDraw.Draw(avatar_canvas)
    ring_rgba = hex_to_rgba(ring_color, 255)
    for w_idx in range(rw):
        d.ellipse([w_idx, w_idx, s - 1 - w_idx, s - 1 - w_idx], outline=ring_rgba)
        
    return avatar_canvas.resize((diameter, diameter), Image.Resampling.LANCZOS)

def generate_header_card(
    logo_path=None,
    display_name="Solo Vibe",
    handle="@solovibecode",
    template="classic_card",     # 'classic_card', 'floating_pill', 'minimal_stamp', 'compact_inline'
    ring_color="#FF6B00",
    bg_style="#000000",          # '#000000', '#00FF00', 'transparent', or hex
    text_color="#FFFFFF",
    handle_color="#71767B",
    show_verified=True,
    scale=1.0
):
    """
    Renders a social reels overlay badge image with verified badge and circular avatar.
    Returns a PIL.Image (RGBA).
    """
    display_name = display_name.strip() or "Creator"
    handle = handle.strip() or "@creator"
    if not handle.startswith('@'):
        handle = '@' + handle

    # Sizing metrics
    avatar_size = int(60 * scale)
    name_font_size = max(12, int(20 * scale))
    handle_font_size = max(10, int(14 * scale))
    verified_size = max(12, int(18 * scale))

    name_font = get_system_font(bold=True, size=name_font_size)
    handle_font = get_system_font(bold=False, size=handle_font_size)

    # Measure text
    n_bbox = name_font.getbbox(display_name)
    name_w = n_bbox[2] - n_bbox[0]
    name_h = n_bbox[3] - n_bbox[1]

    h_bbox = handle_font.getbbox(handle)
    handle_w = h_bbox[2] - h_bbox[0]
    handle_h = h_bbox[3] - h_bbox[1]

    # Create avatar
    avatar = create_circular_avatar(logo_path, diameter=avatar_size, ring_color=ring_color, ring_width=max(2, int(2.5 * scale)))
    verified_badge = draw_verified_badge(verified_size) if show_verified else None

    # Calculate overall dimensions based on template
    pad_x = int(24 * scale)
    pad_y = int(14 * scale)
    gap_avatar_text = int(16 * scale)
    text_line_gap = int(4 * scale)

    if template == 'compact_inline':
        # Single line: [Avatar] [Name] [Verified] [Handle]
        text_w = name_w + (verified_size + int(6 * scale) if show_verified else 0) + int(10 * scale) + handle_w
        total_w = pad_x + avatar_size + gap_avatar_text + text_w + pad_x
        total_h = pad_y * 2 + avatar_size
        radius = total_h // 2
    else:
        # Two lines:
        # Line 1: [Name] [Verified]
        # Line 2: [Handle]
        line1_w = name_w + (verified_size + int(6 * scale) if show_verified else 0)
        text_block_w = max(line1_w, handle_w)
        text_block_h = name_h + text_line_gap + handle_h

        total_w = pad_x + avatar_size + gap_avatar_text + text_block_w + pad_x
        total_h = max(avatar_size + pad_y * 2, text_block_h + pad_y * 2)

        if template == 'floating_pill':
            radius = total_h // 2
        else: # classic_card
            radius = max(8, int(12 * scale))

    # Background canvas
    card = Image.new('RGBA', (total_w, total_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)

    # Draw Background
    if template == 'minimal_stamp' or bg_style == 'transparent':
        # Transparent background (no box fill), add soft drop shadow for readability
        pass
    else:
        if bg_style == 'chroma_green' or bg_style == '#00FF00':
            bg_rgba = (0, 255, 0, 255)
        elif template == 'floating_pill':
            # Glass style: semi-transparent with slight border
            bg_rgba = hex_to_rgba(bg_style if bg_style != '#000000' else '#0F1218', 220)
        else:
            bg_rgba = hex_to_rgba(bg_style, 245)

        d.rounded_rectangle([0, 0, total_w - 1, total_h - 1], radius=radius, fill=bg_rgba)
        
        # Border outline for floating pill
        if template == 'floating_pill':
            border_rgba = (255, 255, 255, 45)
            d.rounded_rectangle([0, 0, total_w - 1, total_h - 1], radius=radius, outline=border_rgba, width=max(1, int(scale)))

    # Paste Avatar
    avatar_x = pad_x
    avatar_y = (total_h - avatar_size) // 2
    card.paste(avatar, (avatar_x, avatar_y), avatar)

    # Paste Text
    text_x = avatar_x + avatar_size + gap_avatar_text
    name_rgba = hex_to_rgba(text_color, 255)
    handle_rgba = hex_to_rgba(handle_color, 220)

    if template == 'compact_inline':
        # Align all elements vertically centered
        name_y = (total_h - name_h) // 2 - n_bbox[1]
        d.text((text_x, name_y), display_name, font=name_font, fill=name_rgba)
        cur_x = text_x + name_w + int(6 * scale)

        if show_verified and verified_badge:
            v_y = (total_h - verified_size) // 2
            card.paste(verified_badge, (cur_x, v_y), verified_badge)
            cur_x += verified_size + int(10 * scale)

        handle_y = (total_h - handle_h) // 2 - h_bbox[1]
        d.text((cur_x, handle_y), handle, font=handle_font, fill=handle_rgba)

    else: # 2-line layout
        total_text_h = name_h + text_line_gap + handle_h
        start_y = (total_h - total_text_h) // 2

        name_y = start_y - n_bbox[1]
        d.text((text_x, name_y), display_name, font=name_font, fill=name_rgba)

        if show_verified and verified_badge:
            v_x = text_x + name_w + int(6 * scale)
            v_y = start_y + (name_h - verified_size) // 2
            card.paste(verified_badge, (v_x, v_y), verified_badge)

        handle_y = start_y + name_h + text_line_gap - h_bbox[1]
        d.text((text_x, handle_y), handle, font=handle_font, fill=handle_rgba)

    return card

def composite_overlay_on_image(target_img_or_path, header_card, position="top-center", custom_coords=None):
    """
    Composites header_card onto the target image at the designated position.
    position: 'top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right', 'center', 'custom'
    custom_coords: dict with {'x': float_percent, 'y': float_percent}
    """
    if isinstance(target_img_or_path, str) and os.path.isfile(target_img_or_path):
        target = Image.open(target_img_or_path).convert('RGBA')
    elif isinstance(target_img_or_path, Image.Image):
        target = target_img_or_path.convert('RGBA')
    else:
        raise ValueError("Invalid target image")

    tw, th = target.size
    cw, ch = header_card.size

    # Auto scale if badge is wider than 70% of the target image
    if cw > tw * 0.85:
        ratio = (tw * 0.85) / float(cw)
        header_card = header_card.resize((int(cw * ratio), int(ch * ratio)), Image.Resampling.LANCZOS)
        cw, ch = header_card.size

    margin_x = max(16, int(tw * 0.04))
    margin_y = max(16, int(th * 0.04))

    if position == 'custom' and custom_coords:
        px = float(custom_coords.get('x', 50))
        py = float(custom_coords.get('y', 10))
        # Support percentage (0..100) or relative (0..1)
        if px <= 1.0 and py <= 1.0:
            px *= 100.0
            py *= 100.0
        pos_x = int((px / 100.0) * tw)
        pos_y = int((py / 100.0) * th)
        # Ensure inside image bounds
        pos_x = max(0, min(tw - cw, pos_x))
        pos_y = max(0, min(th - ch, pos_y))
    elif position == 'top-left':
        pos_x = margin_x
        pos_y = margin_y
    elif position == 'top-right':
        pos_x = tw - cw - margin_x
        pos_y = margin_y
    elif position == 'top-center':
        pos_x = (tw - cw) // 2
        pos_y = margin_y
    elif position == 'bottom-left':
        pos_x = margin_x
        pos_y = th - ch - margin_y
    elif position == 'bottom-right':
        pos_x = tw - cw - margin_x
        pos_y = th - ch - margin_y
    elif position == 'bottom-center':
        pos_x = (tw - cw) // 2
        pos_y = th - ch - margin_y
    elif position == 'center':
        pos_x = (tw - cw) // 2
        pos_y = (th - ch) // 2
    else:
        pos_x = (tw - cw) // 2
        pos_y = margin_y

    # Composite with alpha
    result = target.copy()
    result.paste(header_card, (pos_x, pos_y), header_card)
    return result
