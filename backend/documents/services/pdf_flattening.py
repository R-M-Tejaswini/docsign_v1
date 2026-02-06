import os
from pathlib import Path
from io import BytesIO
from datetime import datetime


from django.conf import settings
from django.core.files.base import ContentFile
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from core.services import HashingService


class PDFFontManager:
    """Manage font registration and retrieval for PDF generation."""
    
    _fonts_registered = False
    _font_path = None
    
    @classmethod
    def register_fonts(cls):
        """Register custom TTF fonts with ReportLab."""
        if cls._fonts_registered:
            return
        
        try:
            # Use STATIC font files, not variable fonts
            font_locations = [
                Path(settings.BASE_DIR) / 'static' / 'fonts' / 'DancingScript-Regular.ttf',
                Path(settings.BASE_DIR) / 'static' / 'fonts' / 'DancingScript-Bold.ttf',
                Path(settings.BASE_DIR).parent / 'static' / 'fonts' / 'DancingScript-Regular.ttf',
                # Add fallback to system fonts if available
                Path('/System/Library/Fonts/Supplemental/Brush Script.ttf'),  # macOS
            ]
            
            for font_path in font_locations:
                if font_path.exists():
                    try:
                        print(f"📝 Attempting to register: {font_path}")
                        # Test if it's a valid TTF
                        with open(font_path, 'rb') as f:
                            header = f.read(4)
                            if header not in [b'\x00\x01\x00\x00', b'true', b'typ1', b'OTTO']:
                                print(f"⚠️  Invalid TTF format: {font_path}")
                                continue
                        
                        pdfmetrics.registerFont(
                            TTFont('DancingScript', str(font_path))
                        )
                        cls._font_path = font_path
                        print(f"✅ Successfully registered font: {font_path}")
                        cls._fonts_registered = True
                        return
                    except Exception as e:
                        print(f"⚠️  Failed to register {font_path}: {type(e).__name__}: {e}")
                        continue
            
            print(f"⚠️  No valid DancingScript font found, using Helvetica fallback")
            cls._fonts_registered = True
            
        except Exception as e:
            print(f"❌ Critical error in register_fonts: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            cls._fonts_registered = True
    
    @classmethod
    def get_font_for_field(cls, field_type: str) -> str:
        """Get the appropriate font name for a field type."""
        cls.register_fonts()
        
        if field_type == 'signature':
            try:
                # Verify the font is registered
                test_font = pdfmetrics.getFont('DancingScript')
                print(f"✓ DancingScript font is available: {test_font.fontName}")
                return 'DancingScript'
            except KeyError:
                print(f"⚠️  DancingScript not registered, using Helvetica")
                return 'Helvetica'
            except Exception as e:
                print(f"⚠️  Error checking DancingScript: {e}")
                return 'Helvetica'
        return 'Helvetica'


class PDFCoordinateConverter:
    """Convert between UI coordinates (top-left origin) and PDF coordinates (bottom-left origin)."""
    
    @staticmethod
    def ui_to_pdf(y_pct: float, height_pct: float, page_height: float = 792) -> tuple:
        """
        Convert UI y-coordinate (top-left origin) to PDF y-coordinate (bottom-left origin).
        
        Args:
            y_pct: Y position as percentage from top (0.0 to 1.0)
            height_pct: Height as percentage (0.0 to 1.0)
            page_height: Page height in points (default 792 for letter)
        
        Returns:
            (pdf_y_bottom, pdf_y_top) tuple in points
        """
        ui_y_pixels = y_pct * page_height
        field_height_pixels = height_pct * page_height
        
        pdf_y_bottom = page_height - ui_y_pixels - field_height_pixels
        pdf_y_top = page_height - ui_y_pixels
        
        return (pdf_y_bottom, pdf_y_top)
    
    @staticmethod
    def compute_font_size(height_pct: float, page_height: float = 792, 
                         field_type: str = 'text', min_size: int = 8, 
                         max_size: int = 32) -> int:
        """Compute appropriate font size based on field height."""
        height_points = height_pct * page_height
        
        if field_type == 'signature':
            font_size = int(height_points * 0.7)  # Slightly smaller for better fit
        elif field_type == 'checkbox':
            font_size = int(height_points * 0.6)
        else:
            font_size = int(height_points * 0.6)
        
        return max(min_size, min(font_size, max_size))


"""
✅ UPDATED: Render static prefilled text onto PDF during flattening
"""

from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor


class PDFOverlayRenderer:
    """Render field overlays onto a PDF canvas."""
    
    PAGE_WIDTH = 612   # Points (8.5 inches)
    PAGE_HEIGHT = 792  # Points (11 inches)
    
    def __init__(self):
        self.converter = PDFCoordinateConverter()
        self.font_manager = PDFFontManager()
        # ✅ ADDED: Register fonts on init
        self.font_manager.register_fonts()
    
    def render_field(self, canvas_obj, field) -> None:
        """✅ UPDATED: Render a single field onto the canvas."""
        
        # ✅ NEW: Handle static prefilled text fields
        if field.field_type == 'prefilled_text' and not field.is_editable_prefill:
            # Static prefilled: always render from prefill_value
            if not field.prefill_value or field.prefill_value.strip() == '':
                return
            value_to_render = field.prefill_value
        else:
            # For all other fields, use the field.value (or skip if empty)
            if not field.value or (isinstance(field.value, str) and field.value.strip() == ''):
                return
            value_to_render = field.value
        
        x = field.x_pct * self.PAGE_WIDTH
        pdf_y_bottom, pdf_y_top = self.converter.ui_to_pdf(
            field.y_pct, field.height_pct, self.PAGE_HEIGHT
        )
        
        width = field.width_pct * self.PAGE_WIDTH
        height = field.height_pct * self.PAGE_HEIGHT
        
        font_size = self.converter.compute_font_size(
            field.height_pct,
            self.PAGE_HEIGHT,
            field.field_type
        )
        
        try:
            if field.field_type == 'prefilled_text':
                self._render_prefilled_text(
                    canvas_obj, field, x, pdf_y_top, width, height,
                    font_size, value_to_render
                )
            elif field.field_type == 'signature':
                self._render_signature(canvas_obj, field, x, pdf_y_top, width, height, font_size, value_to_render)
            elif field.field_type == 'date':
                self._render_date(canvas_obj, field, x, pdf_y_top, width, height, font_size, value_to_render)
            elif field.field_type == 'checkbox':
                self._render_checkbox(canvas_obj, field, x, pdf_y_top, width, height, font_size, value_to_render)
            elif field.field_type == 'text':
                self._render_text(canvas_obj, field, x, pdf_y_top, width, height, font_size, value_to_render)
        except Exception as e:
            print(f"⚠️ Error rendering field {field.label}: {e}")
            import traceback
            traceback.print_exc()
    
    def _render_prefilled_text(self, canvas_obj, field, x: float, y: float,
                              width: float, height: float, font_size: int,
                              text_value: str) -> None:
        """✅ FIXED: Simple text rendering"""
        # Light background box
        canvas_obj.setFillColor(HexColor('#f5f5f5'))
        canvas_obj.rect(x, y, width, height, fill=1, stroke=1)
        
        # Draw text
        canvas_obj.setFont('Helvetica', min(font_size, 10))
        canvas_obj.setFillColor(HexColor('#1a1a1a'))
        
        # Position text in center of box
        text_y = y + (height / 2) - (font_size / 2)
        text_x = x + 2
        
        # Simple single-line text
        canvas_obj.drawString(text_x, text_y, text_value[:100])
    
    def _render_signature(self, canvas_obj, field, x: float, y: float,
                         width: float, height: float, font_size: int,
                         signature_text: str) -> None:
        """✅ FIXED: Render signature field"""
        # Light background box
        canvas_obj.setFillColor(HexColor('#f0f0f0'))
        canvas_obj.rect(x, y, width, height, fill=1, stroke=1)
        
        # Draw signature text in fancy font (or fallback to Helvetica)
        font_name = self.font_manager.get_font_for_field('signature')
        canvas_obj.setFont(font_name, min(font_size, 14))
        canvas_obj.setFillColor(HexColor('#2c3e50'))
        
        # Position text in center
        text_y = y + (height / 2) - (font_size / 2)
        text_x = x + 4
        
        # Draw signature
        canvas_obj.drawString(text_x, text_y, signature_text[:50])
    
    def _render_date(self, canvas_obj, field, x: float, y: float,
                    width: float, height: float, font_size: int,
                    date_text: str) -> None:
        """✅ FIXED: Render date field"""
        # Light background box
        canvas_obj.setFillColor(HexColor('#e8f4f8'))
        canvas_obj.rect(x, y, width, height, fill=1, stroke=1)
        
        # Draw date
        canvas_obj.setFont('Helvetica', min(font_size, 10))
        canvas_obj.setFillColor(HexColor('#16a085'))
        
        # Position text
        text_y = y + (height / 2) - (font_size / 2)
        text_x = x + 2
        
        canvas_obj.drawString(text_x, text_y, date_text[:20])
    
    def _render_checkbox(self, canvas_obj, field, x: float, y: float,
                        width: float, height: float, font_size: int,
                        checkbox_text: str) -> None:
        """✅ FIXED: Render checkbox field"""
        # Draw checkbox box
        canvas_obj.setFillColor(HexColor('#fdf2e9'))
        canvas_obj.rect(x, y, width, height, fill=1, stroke=1)
        
        # Draw checkmark or X
        canvas_obj.setFont('Helvetica-Bold', min(font_size, 12))
        canvas_obj.setFillColor(HexColor('#d68910'))
        
        # Center the checkmark
        text_y = y + (height / 2) - (font_size / 2)
        text_x = x + (width / 2) - 3
        
        # Draw X or checkmark based on value
        if checkbox_text.lower() in ['true', '1', 'yes', 'checked', '✓', '☑']:
            canvas_obj.drawString(text_x, text_y, '✓')
        else:
            canvas_obj.drawString(text_x, text_y, '☐')
    
    def _render_text(self, canvas_obj, field, x: float, y: float,
                    width: float, height: float, font_size: int,
                    text_value: str) -> None:
        """✅ FIXED: Render generic text field"""
        # Light background box
        canvas_obj.setFillColor(HexColor('#ecf0f1'))
        canvas_obj.rect(x, y, width, height, fill=1, stroke=1)
        
        # Draw text
        canvas_obj.setFont('Helvetica', min(font_size, 10))
        canvas_obj.setFillColor(HexColor('#34495e'))
        
        # Position text
        text_y = y + (height / 2) - (font_size / 2)
        text_x = x + 2
        
        # Truncate long text
        canvas_obj.drawString(text_x, text_y, text_value[:100])
    


class PDFFlatteningService:
    """Service for generating flattened PDFs with all overlays merged."""
    
    def __init__(self):
        self.renderer = PDFOverlayRenderer()
    
    def flatten_document(self, document) -> bytes:
        """✅ FIXED: Include ALL fields with values (static + filled)"""
        if not document.file:
            raise FileNotFoundError("Document has no file")
        
        pdf_path = document.file.path
        
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF file not found at {pdf_path}")
        
        reader = PdfReader(pdf_path)
        writer = PdfWriter()
        
        for page_num in range(len(reader.pages)):
            original_page = reader.pages[page_num]
            
            # ✅ FIXED: Get ALL fields that have content:
            # 1. Static prefilled (is_editable_prefill=False) - always have prefill_value
            # 2. Filled editable fields (value is set)
            page_fields = document.fields.filter(
                page_number=page_num + 1
            ).exclude(
                field_type='prefilled_text',
                is_editable_prefill=False,
                prefill_value__in=['', None]  # Skip empty static prefilled
            ).exclude(
                value__in=['', None]  # Skip empty regular fields
            )
            
            if page_fields.exists():
                overlay_buffer = self._create_overlay_page(page_fields)
                overlay_page = PdfReader(overlay_buffer).pages[0]
                original_page.merge_page(overlay_page)
        
            writer.add_page(original_page)
        
        output_buffer = BytesIO()
        writer.write(output_buffer)
        output_buffer.seek(0)
        
        return output_buffer.getvalue()
    
    def _create_overlay_page(self, fields) -> BytesIO:
        """Create a single overlay page for the given fields."""
        overlay_buffer = BytesIO()
        
        # ✅ FIXED: Create canvas with correct page size
        overlay_canvas = canvas.Canvas(
            overlay_buffer,
            pagesize=(self.renderer.PAGE_WIDTH, self.renderer.PAGE_HEIGHT)
        )
        
        # ✅ Set transparent background
        overlay_canvas.setFillAlpha(0)  # Transparent
        
        for field in fields:
            try:
                self.renderer.render_field(overlay_canvas, field)
            except Exception as e:
                print(f"⚠️ Error rendering field {field.label}: {e}")
        
        # ✅ Save and reset pointer
        overlay_canvas.save()
        overlay_buffer.seek(0)
        
        return overlay_buffer
    
    def flatten_and_save(self, document):
        """Flatten signatures onto PDF and save."""
        from django.core.files.base import ContentFile
        
        try:
            print(f"\n🔴 === FLATTENING START ===")
            print(f"📄 Document: {document.id} ({document.title})")
            
            # Check fields
            all_fields = document.fields.all()
            print(f"📋 Total fields: {all_fields.count()}")
            for f in all_fields:
                print(f"  - {f.label}: value='{f.value}', locked={f.locked}, type={f.field_type}")
            
            fields_with_values = document.fields.exclude(value='')
            print(f"✅ Fields with values: {fields_with_values.count()}")
            
            # Perform flattening
            flattened_pdf = self.flatten_document(document)
            print(f"📦 Flattened PDF size: {len(flattened_pdf)} bytes")
            
            # Save the flattened PDF
            filename = f'signed_{datetime.now().timestamp()}.pdf'
            document.signed_file.save(filename, ContentFile(flattened_pdf))
            print(f"💾 Saved to: {document.signed_file.name}")
            
            # Compute hash
            from .document_service import DocumentService
            service = DocumentService()
            service.update_signed_pdf_hash(document)
            
            print(f"🟢 === FLATTENING COMPLETE ===\n")
            return document
            
        except Exception as e:
            print(f"❌ Error flattening PDF: {e}")
            import traceback
            traceback.print_exc()
            raise


# Singleton instance
_flattening_service = None


def get_pdf_flattening_service() -> PDFFlatteningService:
    """Get singleton instance of PDF flattening service."""
    global _flattening_service
    if _flattening_service is None:
        _flattening_service = PDFFlatteningService()
    return _flattening_service