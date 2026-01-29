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


class PDFOverlayRenderer:
    """Render field overlays onto a PDF canvas."""
    
    PAGE_WIDTH = 612   # Points (8.5 inches)
    PAGE_HEIGHT = 792  # Points (11 inches)
    
    def __init__(self):
        self.converter = PDFCoordinateConverter()
        self.font_manager = PDFFontManager()
    
    def render_field(self, canvas_obj, field) -> None:
        """Render a single field onto the canvas."""
        if not field.value or (isinstance(field.value, str) and field.value.strip() == ''):
            return
        
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
            if field.field_type == 'signature':
                self._render_signature(canvas_obj, field, x, pdf_y_bottom, 
                                      width, height, font_size)
            elif field.field_type == 'date':
                self._render_date(canvas_obj, field, x, pdf_y_bottom, 
                                 width, height, font_size)
            elif field.field_type == 'checkbox':
                self._render_checkbox(canvas_obj, field, x, pdf_y_bottom, 
                                     width, height, font_size)
            elif field.field_type == 'text':
                self._render_text(canvas_obj, field, x, pdf_y_bottom, 
                                 width, height, font_size)
        except Exception as e:
            print(f"⚠️  Error rendering field {field.id} ({field.field_type}): {e}")
    
    def _render_signature(self, canvas_obj, field, x: float, y: float, 
                         width: float, height: float, font_size: int) -> None:
        """Render signature text with handwriting-style font."""
        font = self.font_manager.get_font_for_field('signature')
        
        # Use larger font size for signatures
        font_size = max(16, min(font_size, 32))
        
        try:
            canvas_obj.setFont(font, font_size)
        except KeyError:
            print(f"⚠️  Font '{font}' not available, using Helvetica-Oblique")
            canvas_obj.setFont('Helvetica-Oblique', font_size)
            font = 'Helvetica-Oblique'
        
        canvas_obj.setFillColor(HexColor('#1a1a1a'))  # Dark gray/black
        
        # Better vertical centering
        text_y = y + (height * 0.2)
        text_value = str(field.value).strip()[:50]
        
        if not text_value:
            return
        
        try:
            print(f"🖊️  Rendering signature: font='{font}', size={font_size}, text='{text_value[:20]}...'")
            canvas_obj.drawString(x + 4, text_y, text_value)
            print(f"✅ Signature rendered successfully with {font}")
        except Exception as e:
            print(f"❌ Failed to render signature: {type(e).__name__}: {e}")
            # Last resort fallback
            try:
                canvas_obj.setFont('Helvetica-Bold', min(font_size, 16))
                canvas_obj.drawString(x + 4, text_y, text_value)
                print(f"✅ Signature rendered with Helvetica-Bold fallback")
            except Exception as e2:
                print(f"❌ Complete failure to render signature: {e2}")
    
    def _render_date(self, canvas_obj, field, x: float, y: float, 
                    width: float, height: float, font_size: int) -> None:
        """Render date field."""
        canvas_obj.setFont('Helvetica', min(font_size, 10))
        canvas_obj.setFillColor(HexColor('#000000'))
        
        date_str = str(field.value)[:20]
        text_y = y + (height * 0.15)
        canvas_obj.drawString(x + 2, text_y, date_str)
    
    def _render_checkbox(self, canvas_obj, field, x: float, y: float, 
                        width: float, height: float, font_size: int) -> None:
        """Render checkbox (draw checkmark if checked)."""
        value_str = str(field.value).lower()
        is_checked = value_str in ['true', '1', 'yes', 'checked']
        
        if is_checked:
            canvas_obj.setFont('Helvetica-Bold', min(font_size, 14))
            canvas_obj.setFillColor(HexColor('#000000'))
            
            box_center_x = x + (width / 2)
            box_center_y = y + (height / 2)
            
            canvas_obj.drawString(box_center_x - 2, box_center_y - 3, '✓')
    
    def _render_text(self, canvas_obj, field, x: float, y: float, 
                    width: float, height: float, font_size: int) -> None:
        """Render text field with wrapping."""
        canvas_obj.setFont('Helvetica', min(font_size, 10))
        canvas_obj.setFillColor(HexColor('#000000'))
        
        text = str(field.value)
        chars_per_line = max(1, int(width / (font_size * 0.5)))
        
        if len(text) > chars_per_line:
            text = text[:chars_per_line - 1] + '…'
        
        text_y = y + (height * 0.15)
        canvas_obj.drawString(x + 2, text_y, text)


class PDFFlatteningService:
    """Service for generating flattened PDFs with all overlays merged."""
    
    def __init__(self):
        self.renderer = PDFOverlayRenderer()
    
    def flatten_document(self, document) -> bytes:
        """
        Generate flattened PDF with all field overlays merged.
        
        ✅ CONSOLIDATED: Now works with Document directly
        """
        if not document.file:
            raise FileNotFoundError("Document has no file")
        
        pdf_path = document.file.path
        
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF file not found at {pdf_path}")
        
        reader = PdfReader(pdf_path)
        writer = PdfWriter()
        
        for page_num in range(len(reader.pages)):
            original_page = reader.pages[page_num]
            
            page_fields = document.fields.filter(
                page_number=page_num + 1,
                locked=True  # Only render locked (signed) fields
            ).select_for_update(skip_locked=True)
            
            if page_fields.exists():
                overlay_bytes = self._create_overlay_page(page_fields)
                
                try:
                    overlay_reader = PdfReader(overlay_bytes)
                    overlay_page = overlay_reader.pages[0]
                    original_page.merge_page(overlay_page)
                except Exception as e:
                    print(f"⚠️  Error merging overlay for page {page_num + 1}: {e}")
            
            writer.add_page(original_page)
        
        output_buffer = BytesIO()
        writer.write(output_buffer)
        output_buffer.seek(0)
        
        return output_buffer.getvalue()
    
    def _create_overlay_page(self, fields) -> BytesIO:
        """Create a single overlay page for the given fields."""
        overlay_buffer = BytesIO()
        
        overlay_canvas = canvas.Canvas(
            overlay_buffer,
            pagesize=(self.renderer.PAGE_WIDTH, self.renderer.PAGE_HEIGHT)
        )
        
        for field in fields:
            self.renderer.render_field(overlay_canvas, field)
        
        overlay_canvas.save()
        overlay_buffer.seek(0)
        
        return overlay_buffer
    
    def flatten_and_save(self, document):
        """
        Flatten signatures onto PDF and save, then compute hash.
        
        ✅ CONSOLIDATED: Now works with Document directly
        """
        from django.core.files.base import ContentFile
        
        try:
            # Perform flattening
            flattened_pdf = self.flatten_document(document)
            
            # Save the flattened PDF
            filename = f'signed_{datetime.now().timestamp()}.pdf'
            document.signed_file.save(filename, ContentFile(flattened_pdf))
            
            # Compute and store SHA256 of signed PDF
            from .document_service import DocumentService
            service = DocumentService()
            service.update_signed_pdf_hash(document)
            
            return document
        except Exception as e:
            print(f"❌ Error flattening PDF: {e}")
            raise


# Singleton instance
_flattening_service = None


def get_pdf_flattening_service() -> PDFFlatteningService:
    """Get singleton instance of PDF flattening service."""
    global _flattening_service
    if _flattening_service is None:
        _flattening_service = PDFFlatteningService()
    return _flattening_service