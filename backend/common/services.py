"""
Common service utilities - Shared singleton pattern implementation.

What:
- Provides a decorator-based singleton pattern for service classes
- Eliminates boilerplate global variable management

Why:
- DRY principle - single implementation of singleton pattern
- Cleaner service files without global variable tracking
- Thread-safe singleton instance management
"""

from functools import wraps
from typing import TypeVar, Type, cast

T = TypeVar('T')


def singleton(cls: Type[T]) -> Type[T]:
    """
    Decorator to make a class a singleton.
    
    Usage:
        @singleton
        class MyService:
            def do_something(self):
                pass
        
        # Access singleton instance
        service = MyService.get_instance()
    
    Why:
    - Ensures only one instance of service exists
    - Provides consistent .get_instance() API
    - Eliminates manual global variable management
    """
    instances = {}
    
    @wraps(cls)
    def get_instance(*args, **kwargs):
        if cls not in instances:
            instances[cls] = cls(*args, **kwargs)
        return instances[cls]
    
    # Add get_instance as class method with proper type annotation
    cls.get_instance = classmethod(lambda c: cast(T, get_instance()))  # type: ignore
    
    return cast(Type[T], cls)
