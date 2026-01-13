from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TemplateViewSet, TemplateFieldViewSet

router = DefaultRouter()
router.register(r'', TemplateViewSet, basename='template')

# Nested routes for template fields
urlpatterns = [
    path('', include(router.urls)),
    path(
        '<int:template_pk>/fields/',
        TemplateFieldViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='template-fields-list'
    ),
    path(
        '<int:template_pk>/fields/<int:pk>/',
        TemplateFieldViewSet.as_view({
            'get': 'retrieve',
            'put': 'update',
            'patch': 'partial_update',
            'delete': 'destroy'
        }),
        name='template-field-detail'
    ),
]